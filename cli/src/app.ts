import { startMcpServer, startWebServer } from 'aidd-backend';
import { parseArgs, ArgsError } from 'aidd-shared/args/index';
import { createBackend } from 'aidd-shared/backends/factory';
import { resolveConfig, type ResolvedConfig } from 'aidd-shared/config';
import { modeToSurface, setAiCallLogDir } from 'aidd-shared/lib/aiCallLog';
import {
	EXT_LOG_PATH_ENV,
	EXT_RUN_ID_ENV,
	EXT_RUN_SOURCE_ENV,
	type CliActiveRunSource,
} from 'aidd-shared/metadata/active-runs';
import { UnknownMilestoneError, resolveMilestone } from 'aidd-shared/metadata/roadmap';
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
	createRunWorktree,
	reconcileRunWorktree,
	removeRunWorktree,
} from './orchestrator/run/worktree-manager.ts';
import { resolveRunPlan } from './plan/resolve.ts';
import {
	checkExplicitCompletedFeature,
	writeCompletedFeatureRunSummary,
} from './preflight-completed.ts';
import {
	handleStopSignal,
	assertProjectForRun,
	clearStaleStopFile,
	applyInitialPhaseDetection,
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
				`\nReceived ${signal} — stop requested. aidd will exit after the active iteration stops or finishes. Press again to force-quit.`
			);
		} catch (err) {
			console.error(
				`\nReceived ${signal} — failed to write .stop file: ${err instanceof Error ? err.message : String(err)}`
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
					`Milestone '${resolution.milestone}': ${resolution.featureDirectories.length} features from roadmap.json`
				);
			} catch (err) {
				if (err instanceof UnknownMilestoneError) {
					console.error(`Error: Unknown milestone: '${err.milestone}'`);
					console.error('Available milestones in roadmap.json:');
					for (const entry of err.available) {
						console.error(
							`  - ${entry.name}${entry.description ? ` (${entry.description})` : ''}`
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
		if (heartbeat) installCrashFinalizer(heartbeat);
		// Worktree isolation: when requested (and the project has a committed HEAD), the run
		// executes in a throwaway git worktree on branch aidd/run-<id>. The agent's edits,
		// commits, and .aidd/ metadata writes land there — never the live tree — so the
		// completion gate must read the worktree, hence a worktree-rooted store. Initializer
		// runs (no HEAD) fall back to the live tree (createRunWorktree returns null).
		const worktree =
			args.worktree && plan.mode === 'coding'
				? await createRunWorktree(plan.projectDir, heartbeat?.id ?? `cli-${Date.now()}`, {
						...(webDataDir ? { baseDir: join(webDataDir, 'worktrees') } : {}),
					})
				: null;
		if (args.worktree && worktree === null) {
			console.warn(
				'[worktree] --worktree requested but the project has no committed HEAD; running against the live tree.'
			);
		}
		if (worktree) {
			plan.worktree = worktree;
			console.log(`[worktree] run isolated in ${worktree.dir} on branch ${worktree.branch}`);
		}
		const runStore = worktree ? new FileAiddStore(worktree.dir) : store;
		try {
			const scoringRoots = resolveScoringRoots(config);
			const aiSummarizer = createRunAiSummarizer(config, rootDir);
			// Worktree merge-back/park runs INSIDE the orchestrator's terminal writeRunSummary (via
			// this hook) — before the run's heartbeat is finalized — so a parked merge surfaces as a
			// non-success exit code in the active-run/web metadata instead of the pre-merge success.
			const resolveConflict = createMergeResolver({
				backend,
				reasoningEffort: plan.reasoningEffort,
				simulation: plan.simulation,
			});
			const code = await runOrchestrator(plan, {
				aiddProvenance,
				...(aiSummarizer ? { aiSummarizer } : {}),
				backend,
				...(worktree
					? {
							reconcileWorktree: (exitCode: number) =>
								reconcileRunWorktree(
									plan.projectDir,
									worktree,
									exitCode,
									resolveConflict
								),
						}
					: {}),
				rootDir,
				source: externalSource ?? 'cli',
				store: runStore,
				...(heartbeat ? { observer: heartbeat.observer, runId: heartbeat.id } : {}),
				...(scoringRoots.length > 0 ? { scoringRoots } : {}),
			});
			return code;
		} catch (err) {
			// A thrown failure (config/backend/fs error) never reached merge-back: discard the
			// worktree so the run rolls back instead of leaking a branch + checkout. Then rethrow
			// to the outer handler for the standard error exit.
			if (worktree) await removeRunWorktree(plan.projectDir, worktree).catch(() => {});
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
