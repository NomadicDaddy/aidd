import type { ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';

import { type CliActiveRunSource, type RunInitiator } from 'aidd-shared/metadata/active-runs';
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
import { webLogger } from '../../logger.ts';
import { canonicalProjectPath } from '../../paths.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';
import { buildLaunchCommand } from '../runLauncher.ts';
import { HeartbeatWatcher } from './heartbeatWatcher.ts';
import { resolveLaunchConfig } from './launchConfig.ts';
import { effectiveProjectRunCeiling, mayMutateProject } from './launchMutation.ts';
import { failLaunch, recordSpawnedPid, releaseRunSlot } from './launchReservation.ts';
import { guardPendingProjectStop } from './launchStopGuard.ts';
import { getRun } from './queries.ts';
import { spawnDetachedRun } from './spawnDetachedRun.ts';
import { RunTailWatcher } from './tailWatcher.ts';
import { canonicalRunProjectName } from './types.ts';

interface LaunchContext {
	commands: DbCommands;
	config: { web: ResolvedWebConfig } & ResolvedConfig;
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
	/**
	 * Required, with no default, on purpose. Every other launch option is optional and a wrong
	 * guess is visible; a defaulted initiator would be silently wrong, and the failure mode it
	 * guards against is precisely a new automatic launch path inheriting 'operator' and
	 * disappearing into the run history as work somebody asked for. Making it required means the
	 * compiler asks the question at each new call site instead.
	 */
	initiator: RunInitiator;
	scheduledTaskExecutionId?: string;
	source?: CliActiveRunSource;
}

function createRunId(): string {
	return `run_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

async function removeRejectedRunTranscript(logPath: string, runId: string): Promise<void> {
	try {
		await rm(logPath, { force: true });
	} catch (err) {
		// Preserve the launch error clients need while leaving an actionable cleanup signal.
		webLogger.warn({ err, logPath, runId }, 'Failed to remove rejected Run transcript');
	}
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
	options: LaunchRunOptions,
): Promise<typeof runs.$inferSelect> {
	// Director cycles are fleet-wide and do not operate on a single project. They
	// run in a neutral, controlled cwd (data/director, supplied by beginCycle) that
	// is intentionally NOT under allowedRoots — so skip resolveProjectPath, which would
	// reject it. Every other mode resolves and validates the project directory.
	// Canonical so the row, the heartbeat watcher key, and the per-project ceiling all see the
	// one spelling a CLI-adopted run of the same project is stored under.
	const projectDir = canonicalProjectPath(
		input.mode === 'director'
			? input.projectDir || ctx.rootDir
			: await ctx.resolveProjectPath(input.projectDir),
	);
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
		},
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
	// Refuse to launch over a stop still pending for a live sibling run; clear only a stale
	// stop file (see launchStopGuard.ts for the shared-stop-file rationale). This guard precedes
	// every launch-owned artifact so a refusal leaves no transcript behind.
	await guardPendingProjectStop(ctx.db, projectDir);
	// Run-log retention: files written under <web.dataDir>/run-logs/<runId>.log are
	// retained indefinitely; there is no automatic cleanup. The CLI heartbeat writes
	// scrubbed chunks (see scrubSecrets) to this same path via the AIDD_EXT_LOG_PATH
	// env handoff, so high-confidence credential shapes are masked at write time.
	const logPath = join(ctx.config.web.dataDir, 'run-logs', `${runId}.log`);
	// Admission first, execution second. The reservation is an atomic count-and-insert on the
	// worker connection, so parallel callers cannot both pass the count and then both insert,
	// overshooting the ceiling — and because it runs before any child exists, a refusal is
	// still free. The reverse order cannot be made safe: the detached hop is one-way (on
	// Windows the pwsh bridge has usually already fired Start-Process and exited by the time we
	// could kill it), so a spawn-then-check launch that loses the race leaves a live run with
	// no row, invisible to the panel and to every sweeper that reads from `runs`.
	//
	// The row is reserved pid-less. On POSIX recordSpawnedPid stamps the real child pid once it
	// exists; on Windows the spawned process is the transient bridge, so the pid stays null
	// until the first heartbeat mirrors the CLI pid onto the row.
	const reservation = await withSqliteRetry(
		() =>
			ctx.commands.insertRunIfUnderCeiling({
				maxConcurrentRuns: ctx.config.web.maxConcurrentRuns,
				// Two mutating children in one checkout interleave edits and commit over each
				// other; feature leases cover feature selection, not source files or the git
				// baseline. See launchMutation.ts.
				maxConcurrentRunsPerProject: effectiveProjectRunCeiling({
					configured: ctx.config.web.maxConcurrentRunsPerProject,
					isolated: useWorktree,
					mutating: mayMutateProject(mode, input),
				}),
				values: {
					...aiddProvenance,
					backend: effectiveBackend,
					chainedFromRunId: input.chainedFromRunId ?? null,
					commandArgsJson: JSON.stringify(command.args),
					directorCycleId: input.directorCycleId ?? null,
					driverId: input.driver?.driverId ?? null,
					driverKind: input.driver?.driverKind ?? null,
					driverSha256: input.driver?.driverSha256 ?? null,
					id: runId,
					initiator: options.initiator,
					logPath,
					mode,
					model: effectiveModel ?? null,
					pid: null,
					pipelineSessionId: input.pipelineSessionId ?? null,
					projectName: canonicalRunProjectName(command.projectName, mode, source),
					projectPath: projectDir,
					provider: effectiveProvider,
					reasoningEffort: effectiveReasoningEffort,
					scheduledTaskExecutionId: options.scheduledTaskExecutionId ?? null,
					source,
					startedAt,
					status: 'running',
					worktreeBranch,
					worktreePath,
				},
			}),
		{ label: 'run.launch.reserve' },
	).catch((err: unknown) => failLaunch(ctx.hub, runId, err));
	if (reservation.kind === 'rejected') {
		const scope = reservation.scope === 'project' ? 'for this project' : 'across all projects';
		failLaunch(
			ctx.hub,
			runId,
			new Error(
				`Maximum concurrent runs reached ${scope}: ${reservation.limit} (${reservation.activeCount} active)`,
			),
		);
	}
	try {
		await mkdir(dirname(logPath), { recursive: true });
		await writeFile(logPath, '');
	} catch (err) {
		await releaseRunSlot(ctx.commands, runId);
		await removeRejectedRunTranscript(logPath, runId);
		return failLaunch(ctx.hub, runId, err);
	}
	recordDataMovement({
		category: 'file',
		operation: 'run.log.write',
		status: 'success',
		summary: { runId },
		target: logPath,
	});
	recordDataMovement({
		category: 'database',
		operation: 'run.insert',
		status: 'success',
		summary: { mode, runId },
		target: 'runs',
	});
	// Detached spawn — the CLI heartbeat owns process lifetime from here on. The web
	// process never holds a handle that would tie the child to its lifetime; the child
	// resurfaces through the heartbeat watcher on restart.
	//
	// Platform split: on POSIX an orphaned child reparents to init, so spawning the run
	// directly with ignored stdio lets it outlive us. On Windows we briefly run a hidden
	// PowerShell bridge that calls Start-Process -WindowStyle Hidden for the relauncher
	// and passes the real run argv through a payload file. Not using a
	// `cmd.exe /c start /b` hop is load-bearing: that hop can inherit the web listener
	// socket and pin the control panel port until the detached run exits.
	//
	// Stderr handling differs per platform. On Windows the relauncher opens the run log
	// itself before spawning the real CLI, so the web process passes no file descriptor
	// through the detached hop. On POSIX we spawn the run directly and append its stderr
	// to the run log here: a CLI that dies during early startup — e.g. an arg-parse error
	// thrown before CliActiveRunHeartbeat begins writing — would otherwise leave a 0-byte
	// log and surface only as the generic "exited before writing a heartbeat" sweep
	// message. The heartbeat appends its own streamed output to the same path; both are
	// O_APPEND handles so neither clobbers.
	const { recordPid } = await spawnDetachedRun({
		command,
		dataDir: ctx.config.web.dataDir,
		...(input.driver ? { driver: input.driver } : {}),
		hostname: ctx.config.web.hostname,
		initiator: options.initiator,
		logPath,
		port: ctx.config.web.port,
		projectDir,
		rootDir: ctx.rootDir,
		runId,
		source,
	}).catch(async (err: unknown) => {
		// Nothing started, so the reservation is a phantom: give the slot back before the
		// caller sees the error, or the ceiling counts a run that will never heartbeat. The
		// transcript belongs to that reservation too, so remove it before reporting failure.
		await releaseRunSlot(ctx.commands, runId);
		await removeRejectedRunTranscript(logPath, runId);
		return failLaunch(ctx.hub, runId, err);
	});
	if (recordPid !== null) await recordSpawnedPid(ctx.commands, runId, recordPid);
	// Supervision before the read-back: the child is admitted and executing by now, so it has to
	// be watched even if reading its own row back fails.
	await ensureHeartbeatWatcher(ctx, projectDir);
	if (!ctx.tailWatchers.has(runId)) {
		const tail = await RunTailWatcher.start(runId, logPath, ctx.hub);
		ctx.tailWatchers.set(runId, tail);
	}
	const record = await getRun(ctx.db, runId);
	if (!record) throw new Error(`Run was not persisted: ${runId}`);
	if (mode === 'audit') ctx.onProjectChanged?.(projectDir);
	ctx.hub.broadcast({ payload: { status: 'running' }, runId, type: 'run_status' });
	return record;
}
