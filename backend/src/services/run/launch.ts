import type { ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';

import { killProcessTree } from 'aidd-shared/lib/processTree';
import { type CliActiveRunSource } from 'aidd-shared/metadata/active-runs';
import { resolveEffectiveLaunchTarget } from 'aidd-shared/plan/launch-target';
import { normalizeBackendName } from 'aidd-shared/plan/types';
import { resolveAiddRunProvenance } from 'aidd-shared/run-provenance';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { WebDatabase } from '../../db/client.ts';
import type { DbCommands } from '../../db/commands.ts';
import type { RunContinuationReason, RunLaunchRequest } from '../../types.ts';
import type { WebSocketHub } from '../../webSocketHub.ts';
import type { TelemetryService } from '../telemetryService.ts';

import { withSqliteRetry } from '../../db/retry.ts';
import { type runs } from '../../db/schema.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';
import { buildLaunchCommand } from '../runLauncher.ts';
import { HeartbeatWatcher } from './heartbeatWatcher.ts';
import { resolveLaunchConfig } from './launchConfig.ts';
import { guardPendingProjectStop } from './launchStopGuard.ts';
import { getRun } from './queries.ts';
import { spawnDetachedRun } from './spawnDetachedRun.ts';
import { RunTailWatcher } from './tailWatcher.ts';
import { canonicalRunProjectName } from './types.ts';

interface LaunchContext {
	commands: DbCommands;
	config: ResolvedConfig & { web: ResolvedWebConfig };
	db: WebDatabase;
	heartbeatWatchers: Map<string, HeartbeatWatcher>;
	hub: WebSocketHub;
	onProjectChanged?: (projectPath: string) => void;
	onRunContinuation?: (runId: string, reason: RunContinuationReason) => void;
	resolveProjectPath(path: string): Promise<string>;
	rootDir: string;
	tailWatchers: Map<string, RunTailWatcher>;
	telemetry: TelemetryService;
}

export interface LaunchRunOptions {
	source?: CliActiveRunSource;
}

function createRunId(): string {
	return `run_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

async function ensureHeartbeatWatcher(ctx: LaunchContext, projectPath: string): Promise<void> {
	if (ctx.heartbeatWatchers.has(projectPath)) return;
	const watcher = await HeartbeatWatcher.start(projectPath, {
		commands: ctx.commands,
		db: ctx.db,
		hub: ctx.hub,
		tailWatchers: ctx.tailWatchers,
		telemetry: ctx.telemetry,
		...(ctx.onProjectChanged ? { onProjectChanged: ctx.onProjectChanged } : {}),
		...(ctx.onRunContinuation ? { onRunContinuation: ctx.onRunContinuation } : {}),
	});
	ctx.heartbeatWatchers.set(projectPath, watcher);
}

export async function launchRun(
	ctx: LaunchContext,
	input: RunLaunchRequest,
	options: LaunchRunOptions = {}
): Promise<typeof runs.$inferSelect> {
	// Director cycles are fleet-wide and do not operate on a single project. They
	// run in a neutral, controlled cwd (data/director, supplied by beginCycle) that
	// is intentionally NOT under allowedRoots — so skip resolveProjectPath, which would
	// reject it. Every other mode resolves and validates the project directory.
	const projectDir =
		input.mode === 'director'
			? input.projectDir || ctx.rootDir
			: await ctx.resolveProjectPath(input.projectDir);
	// Layer the target project's .aidd/aidd.config.json over the user config (as a direct CLI
	// invocation would) so the values recorded and pinned on the child argv match what the
	// project actually configures. Director cycles run in data/director, not a project tree,
	// so they resolve from the user config alone.
	const { config: launchConfig } = await resolveLaunchConfig({
		base: ctx.config,
		projectDir: input.mode === 'director' ? null : projectDir,
	});
	const mode = input.mode ?? 'coding';
	const target = resolveEffectiveLaunchTarget(launchConfig, mode, {
		backend: input.backend ? normalizeBackendName(input.backend) : undefined,
		model: input.model,
		reasoningEffort: input.reasoningEffort,
	});
	const effectiveBackend = target.backend;
	const effectiveModel = target.model;
	const effectiveProvider = target.provider ?? null;
	const effectiveReasoningEffort = target.reasoningEffort;
	// Worktree isolation is config-gated and only meaningful for coding runs (director runs
	// write to data/director, not the project tree). The CLI gates on coding mode too.
	const useWorktree = ctx.config.web.useWorktrees && mode === 'coding';
	const command = await buildLaunchCommand(
		ctx.rootDir,
		{ ...input, projectDir, worktree: useWorktree },
		{
			backend: effectiveBackend,
			model: effectiveModel,
			reasoningEffort: effectiveReasoningEffort,
			triumvirate: launchConfig.triumvirate,
		}
	);
	const aiddProvenance = await resolveAiddRunProvenance(ctx.rootDir);
	const runId = createRunId();
	const startedAt = Date.now();
	const source: CliActiveRunSource = options.source ?? 'web';
	// Deterministic worktree location (matches the CLI's createRunWorktree, which uses the same
	// runId via AIDD_EXT_RUN_ID + <dataDir>/worktrees). Stored on the row so the orphan sweeper
	// can reap it without the CLI reporting back.
	const worktreePath = useWorktree ? join(ctx.config.web.dataDir, 'worktrees', runId) : null;
	const worktreeBranch = useWorktree ? `aidd/run-${runId}` : null;
	// Run-log retention: files written under ${web.dataDir}/run-logs/${runId}.log are
	// retained indefinitely; there is no automatic cleanup. The CLI heartbeat writes
	// scrubbed chunks (see scrubSecrets) to this same path via the AIDD_EXT_LOG_PATH
	// env handoff, so high-confidence credential shapes are masked at write time.
	const logPath = join(ctx.config.web.dataDir, 'run-logs', `${runId}.log`);
	await mkdir(dirname(logPath), { recursive: true });
	await writeFile(logPath, '');
	// Refuse to launch over a stop still pending for a live sibling run; clear only a stale
	// stop file (see launchStopGuard.ts for the shared-stop-file rationale).
	await guardPendingProjectStop(ctx.db, projectDir);
	recordDataMovement({
		category: 'file',
		operation: 'run.log.write',
		status: 'success',
		summary: { runId },
		target: logPath,
	});
	// Detached spawn — the CLI heartbeat owns process lifetime from here on. The web
	// process never holds a handle that would tie the child to its lifetime; the child
	// resurfaces through the heartbeat watcher on restart.
	//
	// Platform split: on POSIX an orphaned child reparents to init, so spawning the run
	// directly with ignored stdio lets it outlive us. On Windows we briefly run a hidden
	// PowerShell bridge that calls Start-Process -WindowStyle Hidden for the relauncher
	// and passes the real run argv through a payload file. Avoiding the old
	// `cmd.exe /c start /b` hop is load-bearing: that hop could inherit the web listener
	// socket and pin the control panel port until the detached run exited.
	//
	// Stderr handling differs per platform. On Windows the relauncher opens the run log
	// itself before spawning the real CLI, so the web process passes no file descriptor
	// through the detached hop. On POSIX we spawn the run directly and append its stderr
	// to the run log here: a CLI that dies during early startup — e.g. an arg-parse error
	// thrown before CliActiveRunHeartbeat begins writing — would otherwise leave a 0-byte
	// log and surface only as the generic "exited before writing a heartbeat" sweep
	// message. The heartbeat appends its own streamed output to the same path; both are
	// O_APPEND handles so neither clobbers.
	const { childProcess, payloadPath, recordPid } = await spawnDetachedRun({
		command,
		dataDir: ctx.config.web.dataDir,
		hostname: ctx.config.web.hostname,
		logPath,
		port: ctx.config.web.port,
		projectDir,
		rootDir: ctx.rootDir,
		runId,
		source,
	});
	let record: typeof runs.$inferSelect | undefined;
	try {
		// Atomic count-and-insert: eliminates the TOCTOU race where two parallel
		// launch callers could both pass the count check and then both insert,
		// overshooting the maxConcurrentRuns ceiling. The insertRunIfUnderCeiling
		// command runs inside a single SQLite transaction on the worker connection,
		// so the count and insert are never interleaved.
		const result = await withSqliteRetry(
			() =>
				ctx.commands.insertRunIfUnderCeiling({
					maxConcurrentRuns: ctx.config.web.maxConcurrentRuns,
					maxConcurrentRunsPerProject: ctx.config.web.maxConcurrentRunsPerProject,
					values: {
						...aiddProvenance,
						backend: effectiveBackend,
						chainedFromRunId: input.chainedFromRunId ?? null,
						commandArgsJson: JSON.stringify(command.args),
						directorCycleId: input.directorCycleId ?? null,
						id: runId,
						logPath,
						mode: input.mode ?? 'coding',
						model: effectiveModel ?? null,
						// On Windows childProcess.pid is the detached relauncher, not the real run.
						// Leave pid null; the first heartbeat mirrors the real CLI pid onto the row.
						// On POSIX the child IS the run, so its pid is recorded directly.
						pid: recordPid,
						pipelineSessionId: input.pipelineSessionId ?? null,
						projectName: canonicalRunProjectName(command.projectName, mode, source),
						projectPath: projectDir,
						provider: effectiveProvider,
						reasoningEffort: effectiveReasoningEffort,
						source,
						startedAt,
						status: 'running',
						worktreeBranch,
						worktreePath,
					},
				}),
			{ label: 'run.launch.insert' }
		);
		if (result.kind === 'rejected') {
			const scopeLabel =
				result.scope === 'project' ? 'for this project' : 'across all projects';
			throw new Error(
				`Maximum concurrent runs reached ${scopeLabel}: ${result.limit} (${result.activeCount} active)`
			);
		}
		recordDataMovement({
			category: 'database',
			operation: 'run.insert',
			status: 'success',
			summary: { mode: input.mode ?? 'coding', runId },
			target: 'runs',
		});
		record = await getRun(ctx.db, runId);
		if (!record) throw new Error(`Run was not persisted: ${runId}`);
	} catch (err) {
		// Best-effort: remove the one-shot payload so a failed launch leaves no litter.
		if (payloadPath) await rm(payloadPath, { force: true }).catch(() => {});
		try {
			await killProcessTree(childProcess.pid);
			// Block briefly until the OS reports the child gone so callers get a
			// deterministic post-condition (the persistence-failure contract is "the
			// run never existed"). The detached child has no DB row and no heartbeat
			// observer, so without this wait the PID can outlive the rejected launchRun call.
			//
			// On Windows childProcess is the short-lived pwsh bridge, which has usually
			// already fired Start-Process and exited — killing it cannot reach the
			// relauncher or the run. A persistence failure here (a rare SQLite write error
			// after retries) can therefore leave a detached run with no DB row: it completes
			// and writes its own runs.jsonl entry but is untracked by the panel. Acceptable
			// for this rare path. On POSIX the child IS the run, so cleanup is direct.
			await Promise.race([childProcess.exited, Bun.sleep(2000)]);
		} catch {
			// best-effort cleanup; the detached child may have already started writing
			// a heartbeat by the time we try to kill it. The heartbeat watcher will
			// eventually mark it stale, but in practice this path only fires on a
			// SQLite write error that the caller will see as a launch failure.
		}
		const message = err instanceof Error ? err.message : String(err);
		ctx.hub.broadcast({
			payload: { error: message, status: 'failed' },
			runId,
			type: 'run_status',
		});
		throw err;
	}
	await ensureHeartbeatWatcher(ctx, projectDir);
	if (!ctx.tailWatchers.has(runId)) {
		const tail = await RunTailWatcher.start(runId, logPath, ctx.hub);
		ctx.tailWatchers.set(runId, tail);
	}
	if ((input.mode ?? 'coding') === 'audit') {
		ctx.onProjectChanged?.(projectDir);
	}
	ctx.hub.broadcast({ payload: { status: 'running' }, runId, type: 'run_status' });
	return record;
}
