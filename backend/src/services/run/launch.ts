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
import { admitQueuedRuns } from './admission.ts';
import { type HeartbeatWatcher } from './heartbeatWatcher.ts';
import { resolveLaunchConfig } from './launchConfig.ts';
import { failLaunch, releaseRunSlot } from './launchReservation.ts';
import { guardPendingProjectStop } from './launchStopGuard.ts';
import { getRun } from './queries.ts';
import { type RunTailWatcher } from './tailWatcher.ts';
import { canonicalRunProjectName } from './types.ts';

export interface LaunchContext {
	commands: DbCommands;
	config: { web: ResolvedWebConfig } & ResolvedConfig;
	db: WebDatabase;
	heartbeatWatchers: Map<string, HeartbeatWatcher>;
	hub: WebSocketHub;
	isDisposed: () => boolean;
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
	// Refuse to launch over a stop still pending for a live sibling run; clear only a stale
	// stop file (see launchStopGuard.ts for the shared-stop-file rationale). This guard precedes
	// every launch-owned artifact so a refusal leaves no transcript behind.
	await guardPendingProjectStop(ctx.db, projectDir);
	// Run-log retention: files written under <web.dataDir>/run-logs/<runId>.log are
	// retained indefinitely; there is no automatic cleanup. The CLI heartbeat writes
	// scrubbed chunks (see scrubSecrets) to this same path via the AIDD_EXT_LOG_PATH
	// env handoff, so high-confidence credential shapes are masked at write time.
	const logPath = join(ctx.config.web.dataDir, 'run-logs', `${runId}.log`);
	// Queue first, execute on admission. Every managed launch inserts as queued; admitQueuedRuns
	// then promotes rows to running inside one worker transaction that counts running rows, so
	// parallel callers cannot overshoot either ceiling, and only a promoted row is ever spawned.
	// The reverse order cannot be made safe: the detached hop is one-way (on Windows the pwsh
	// bridge has usually already fired Start-Process and exited by the time we could kill it), so
	// a spawn-then-check launch that loses the race leaves a live run with no row.
	//
	// The row is inserted pid-less. On POSIX recordSpawnedPid stamps the real child pid once it
	// exists; on Windows the spawned process is the transient bridge, so the pid stays null
	// until the first heartbeat mirrors the CLI pid onto the row.
	await withSqliteRetry(
		() =>
			ctx.commands.insertQueuedRun({
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
					status: 'queued',
				},
			}),
		{ label: 'run.launch.queue' },
	).catch((err: unknown) => failLaunch(ctx.hub, runId, err));
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
	await admitQueuedRuns(ctx, runId);
	const record = await getRun(ctx.db, runId);
	if (!record) throw new Error(`Run was not persisted: ${runId}`);
	if (record.status === 'queued') {
		ctx.hub.broadcast({ payload: { status: 'queued' }, runId, type: 'run_status' });
	}
	if (mode === 'audit' && record.status === 'running') ctx.onProjectChanged?.(projectDir);
	return record;
}
