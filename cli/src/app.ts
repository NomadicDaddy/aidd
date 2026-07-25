import { startMcpServer, startWebServer } from 'aidd-backend';
import { ArgsError, parseArgs } from 'aidd-shared/args/index';
import { createBackend } from 'aidd-shared/backends/factory';
import { resolveConfig, type ResolvedConfig } from 'aidd-shared/config';
import { modeToSurface, setAiCallLogDir } from 'aidd-shared/lib/aiCallLog';
import {
	type CliActiveRunSource,
	EXT_LOG_PATH_ENV,
	EXT_RUN_ID_ENV,
	EXT_RUN_SOURCE_ENV,
} from 'aidd-shared/metadata/active-runs';
import { createFeatureLeaseService } from 'aidd-shared/metadata/feature-leases';
import { resolveMilestone, UnknownMilestoneError } from 'aidd-shared/metadata/roadmap';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { readAiddVersion, resolveAiddRunProvenance } from 'aidd-shared/run-provenance';
import { resolveRootDir } from 'aidd-shared/runtime';
import { compileSkillDirective, readSkillDefinition } from 'aidd-shared/skills/catalog';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { formatConfigMatrix } from './config-matrix.ts';
import { printHelp } from './help.ts';
import { initGitAfterScaffold } from './metadata/git.ts';
import { ensureMetadata } from './metadata/init.ts';
import { extractAllIterations, extractLatestIteration } from './metadata/log-extract.ts';
import { scaffoldProjectAssets, skillContractDeps } from './metadata/scaffold.ts';
import { buildActiveRunCommandArgs } from './orchestrator/active-run-command.ts';
import { CliActiveRunHeartbeat } from './orchestrator/active-run-heartbeat.ts';
import { installCrashFinalizer } from './orchestrator/crash-finalizer.ts';
import { runOrchestrator } from './orchestrator/orchestrator.ts';
import { createRunAiSummarizer } from './orchestrator/run/ai-summary.ts';
import { createMergeResolver } from './orchestrator/run/merge-resolver.ts';
import {
	prepareWorktreeRun,
	rollbackWorktreeRun,
	worktreeOrchestratorDeps,
} from './orchestrator/run/worktree-run-setup.ts';
import { resolveRunPlan } from './plan/resolve.ts';
import {
	checkExplicitCompletedFeature,
	writeCompletedFeatureRunSummary,
} from './preflight-completed.ts';
import {
	applyInitialPhaseDetection,
	assertProjectForRun,
	clearStaleStopFile,
	handleStopSignal,
} from './preflight.ts';

const rootDir = resolveRootDir(import.meta.url, 2);

function installStopSignalHandler(stopFile: string): void {
	let stopRequested = false;
	const handler = (signal: NodeJS.Signals): void => {
		if (stopRequested) {
			console.error(`\nReceived ${signal} again — exiting immediately.`);
			process.exit(130);
		}
		stopRequested = true;
		try {
			mkdirSync(dirname(stopFile), { recursive: true });
			writeFileSync(stopFile, new Date().toISOString());
			console.error(
				`\nReceived ${signal} — stop requested. aidd will exit after the active iteration stops or finishes. Press again to force-quit.`,
			);
		} catch (err) {
			console.error(
				`\nReceived ${signal} — failed to write .stop file: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	};
	process.on('SIGINT', handler);
	process.on('SIGTERM', handler);
}

export async function run(argv: string[]): Promise<number> {
	try {
		const args = parseArgs(argv);
		if (args.help) {
			printHelp();
			return 0;
		}
		if (args.version) {
			console.log(`aidd v${(await readAiddVersion(rootDir)) ?? 'unknown'}`);
			return 0;
		}
		const config = await resolveConfig(args, {
			applyCliOverrides: !args.configMatrix,
			baseDir: rootDir,
		});
		if (args.configMatrix) {
			console.log(formatConfigMatrix(config));
			return 0;
		}
		setAiCallLogDir(resolve(rootDir, 'logs'));
		if (args.webMode) {
			return await startWebServer(config, { rootDir });
		}
		if (args.mcpMode) {
			return await startMcpServer(config, { rootDir });
		}
		let skillContracts: ReturnType<typeof skillContractDeps>;
		if (args.skillId) {
			const skill = await readSkillDefinition(rootDir, args.skillId, config.web?.dataDir);
			args.customPrompt = compileSkillDirective(skill, args.skillArgs ?? '');
			// The invoked skill's declared contract dependencies are staged into the project's
			// `.aidd/` below so a sandboxed agent can read them locally instead of reaching for a
			// `<aidd-root>/...` (or `<spernakit-root>/...`) path outside the project directory.
			skillContracts = skillContractDeps(skill);
		}
		await assertProjectForRun(args);

		const plan = resolveRunPlan(args, config);
		const aiddProvenance = await resolveAiddRunProvenance(rootDir);
		if (await handleStopSignal(args, config.projectDir, plan.stopPolicy.stopFile)) return 0;
		if (plan.outputPolicy.extractStructured) {
			const latest = await extractLatestIteration(plan.projectDir);
			console.log(JSON.stringify(latest ?? null, null, 2));
			return latest ? 0 : 1;
		}
		if (plan.outputPolicy.extractBatch) {
			const all = await extractAllIterations(plan.projectDir);
			console.log(JSON.stringify(all, null, 2));
			return 0;
		}
		const store = new FileAiddStore(plan.projectDir);
		await ensureMetadata(plan.projectDir, rootDir);
		if (plan.mode === 'coding') {
			const completedCheck = await checkExplicitCompletedFeature(plan, store);
			if (completedCheck !== undefined) {
				await writeCompletedFeatureRunSummary(store, plan, completedCheck, aiddProvenance);
				console.log(completedCheck.message);
				return 0;
			}
		}
		await applyInitialPhaseDetection(plan);
		if (plan.prompt.milestone && plan.scope.milestone) {
			try {
				const roadmap = await store.readRoadmap();
				const resolution = resolveMilestone(roadmap, plan.scope.milestone);
				plan.prompt.milestone.featureDirectories = resolution.featureDirectories;
				console.log(
					`Milestone '${resolution.milestone}': ${resolution.featureDirectories.length} features from roadmap.json`,
				);
			} catch (err) {
				if (err instanceof UnknownMilestoneError) {
					console.error(`Error: Unknown milestone: '${err.milestone}'`);
					console.error('Available milestones in roadmap.json:');
					for (const entry of err.available) {
						console.error(
							`  - ${entry.name}${entry.description ? ` (${entry.description})` : ''}`,
						);
					}
					return 2;
				}
				const message = err instanceof Error ? err.message : String(err);
				console.error(`Error: --milestone requires .aidd/roadmap.json (${message})`);
				return 2;
			}
		}
		// Validate / check-only runs (--check-features, --check-artifacts, --validate) are
		// metadata operations per assertion BEH-006: they read feature.json and roadmap and
		// must not mutate the working tree. scaffoldProjectAssets force-overwrites scaffolded
		// assets (prompts, shared files, templates) and ensureProjectGitRepo can git-init, so
		// both are skipped in validate mode. This keeps `--check-features` safe to run against
		// a live checkout (e.g. dogfooding aidd on its own repo); only execution modes scaffold.
		if (plan.mode !== 'validate') {
			// spernakitRoot = parent of the configured init script (the sole spernakit marker);
			// it resolves a skill's spernakit-references.
			await scaffoldProjectAssets(plan, rootDir, {
				...(config.web?.dataDir ? { dataDir: config.web.dataDir } : {}),
				...(config.sharedDirs !== undefined ? { sharedDirs: config.sharedDirs } : {}),
				...(config.sharedFiles !== undefined ? { sharedFiles: config.sharedFiles } : {}),
				...(skillContracts !== undefined ? { skillContracts } : {}),
				...(config.web?.spernakitInitScript
					? { spernakitRoot: dirname(config.web.spernakitInitScript) }
					: {}),
			});
			if (plan.initGitAfterScaffold) {
				await initGitAfterScaffold(plan.projectDir);
			}
		}
		await clearStaleStopFile(plan.projectDir, plan.stopPolicy.stopFile);
		installStopSignalHandler(plan.stopPolicy.stopFile);
		const backend = createBackend(plan.backend, modeToSurface(plan.mode));
		const externalRunId = process.env[EXT_RUN_ID_ENV];
		const externalSourceRaw = process.env[EXT_RUN_SOURCE_ENV];
		const externalSource: CliActiveRunSource | undefined =
			externalSourceRaw === 'web' || externalSourceRaw === 'director'
				? externalSourceRaw
				: undefined;
		const externalLogPath = process.env[EXT_LOG_PATH_ENV];
		let cliLogPath: string | undefined;
		const webDataDir = config.web?.dataDir;
		if (externalLogPath) {
			cliLogPath = externalLogPath;
			await mkdir(dirname(cliLogPath), { recursive: true });
		} else if (webDataDir) {
			const runLogId = `run_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
			cliLogPath = join(webDataDir, 'run-logs', `${runLogId}.log`);
			await mkdir(dirname(cliLogPath), { recursive: true });
		}
		const heartbeat = await CliActiveRunHeartbeat.start(plan, {
			aiddProvenance,
			commandArgs: buildActiveRunCommandArgs(plan, argv),
			...(externalRunId ? { externalRunId } : {}),
			...(externalSource ? { externalSource } : {}),
			logPath: cliLogPath ?? null,
			...(webDataDir ? { webDataDir } : {}),
		});
		// A hard death (unhandled rejection / uncaught exception) skips the finally below
		// because Bun exits without unwinding suspended async frames; without this the run's
		// records freeze mid-flight and the web reaps it as heartbeat_stale with no ledger
		// entry, even when the backend finished its work.
		// Worktree runs: a hard death ALSO skips worktree finalization AND the catch-path
		// rollback below — the checkout's iteration evidence is lost with it (accepted; the
		// crash finalizer still lands a canonical failed ledger line via the heartbeat
		// fallback), and the web orphan sweeper reaps the leftover worktree + branch. Any
		// crash-scoped resource with cross-run effects (e.g. feature leases) must therefore be
		// released by that sweep, never by in-process cleanup alone.
		if (heartbeat) installCrashFinalizer(heartbeat);
		const runId = heartbeat?.id ?? `cli-${Date.now()}`;
		// Cross-run feature leases (coding runs, worktree AND live-tree): concurrent runs against
		// one project coordinate selection through exclusive lease files under git's common dir,
		// so two runs can never claim the same feature. Rooted at the CANONICAL projectDir — the
		// common dir is shared by every linked worktree either way. In-process release happens in
		// writeRunSummary (all terminal outcomes) and in the catch below; hard deaths reap via web.
		const featureLeases =
			plan.mode === 'coding'
				? createFeatureLeaseService({
						pid: process.pid,
						projectDir: plan.projectDir,
						runId,
					})
				: undefined;
		try {
			// Worktree isolation: when requested (and the project has a committed HEAD), the run
			// executes in a throwaway git worktree on branch aidd/run-<id>, seeded with the
			// canonical `.aidd` metadata so the run store sees the real project; the completion
			// gate reads the worktree, hence a worktree-rooted store. Runs INSIDE this try:
			// prepareWorktreeRun records plan.worktree before seeding, so a seeding failure hits
			// the catch below (rolling the registered worktree back) and the finally (disposing
			// the heartbeat) instead of leaking both. See worktree-run-setup.ts.
			const worktreeRun = await prepareWorktreeRun({
				plan,
				requested: args.worktree === true,
				runId,
				...(webDataDir ? { webDataDir } : {}),
			});
			const runStore = plan.worktree ? new FileAiddStore(plan.worktree.dir) : store;
			const scoringRoots = resolveScoringRoots(config);
			const aiSummarizer = createRunAiSummarizer(config, rootDir);
			const resolveConflict = createMergeResolver({
				backend,
				reasoningEffort: plan.reasoningEffort,
				simulation: plan.simulation,
			});
			const code = await runOrchestrator(plan, {
				aiddProvenance,
				...(aiSummarizer ? { aiSummarizer } : {}),
				backend,
				...(featureLeases ? { featureLeases } : {}),
				...(worktreeRun
					? worktreeOrchestratorDeps(plan, worktreeRun, store, resolveConflict)
					: {}),
				rootDir,
				source: externalSource ?? 'cli',
				store: runStore,
				...(heartbeat ? { observer: heartbeat.observer, runId: heartbeat.id } : {}),
				...(scoringRoots.length > 0 ? { scoringRoots } : {}),
			});
			return code;
		} catch (err) {
			// A thrown failure (config/backend/fs error) never reached merge-back: preserve
			// evidence, discard the worktree, release the run's feature leases (writeRunSummary
			// never ran), rethrow to the outer handler.
			await rollbackWorktreeRun(plan);
			await featureLeases?.releaseAll();
			throw err;
		} finally {
			await heartbeat?.dispose();
		}
	} catch (err) {
		if (err instanceof ArgsError) {
			console.error(`Error: ${err.message}`);
			return 2;
		}
		const message = err instanceof Error ? err.message : String(err);
		console.error(`Error: ${message}`);
		return 1;
	}
}

function resolveScoringRoots(config: ResolvedConfig): string[] {
	const roots = new Set<string>();
	if (config.applicationsRoot) roots.add(config.applicationsRoot);
	for (const root of config.web?.allowedRoots ?? []) roots.add(root);
	return [...roots];
}
