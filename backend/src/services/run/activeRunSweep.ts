import { CLI_ACTIVE_RUN_STALE_MS } from 'aidd-shared/metadata/active-runs';
import { reapRunFeatureLeases } from 'aidd-shared/metadata/feature-leases';
import { inArray } from 'drizzle-orm';

import type { HeartbeatWriteOutcome } from '../../db/commands.ts';
import type { QueriesContext } from './queries.ts';

import { withSqliteRetry } from '../../db/retry.ts';
import { runs } from '../../db/schema.ts';
import { webLogger } from '../../logger.ts';
import { isPidAlive } from '../appLauncher/shared.ts';
import { readHeartbeatRecord, type SweptRunInfo } from './activeRunHeartbeatFile.ts';
import { NON_TERMINAL_RUN_STATUSES, RECONCILED_EXIT_CODE } from './types.ts';
import { reapRunWorktree } from './worktreeReap.ts';

// Periodic in-session sweep that closes the one gap boot reconciliation and the file-driven
// HeartbeatWatcher both leave open: a run whose supervising process dies *before* it ever writes
// a heartbeat file. Such a row is invisible to HeartbeatWatcher (no file to observe) and stays
// 'running' until the next web restart. pid-liveness is the discriminator — a missing heartbeat
// with a still-alive pid is a run mid-startup (heartbeat imminent) and is left untouched; only a
// missing heartbeat with a dead/absent pid confirms the process is gone.
export async function sweepOrphanedRuns(ctx: QueriesContext): Promise<SweptRunInfo[]> {
	const now = Date.now();
	const activeRuns = await ctx.db
		.select()
		.from(runs)
		.where(inArray(runs.status, [...NON_TERMINAL_RUN_STATUSES]));
	const swept: SweptRunInfo[] = [];
	for (const run of activeRuns) {
		// A heartbeat file means the CLI registered itself; HeartbeatWatcher owns every
		// transition from there (resume, terminalize, stale-fail). Never second-guess it.
		const heartbeat = await readHeartbeatRecord(run.projectPath, run.id);
		if (heartbeat) continue;
		// Within the startup grace window, spare a run that is plausibly still coming up:
		// either we have no usable pid yet, or the recorded pid is still alive. A null pid is
		// NOT treated as dead here — detached launches record the real CLI pid only via the
		// first heartbeat, and on Windows the launch goes through a cmd/start relauncher whose
		// own pid never reaches the row, so run.pid stays null until that first heartbeat.
		// Failing a null-pid row inside the window would kill a perfectly healthy run. Only a
		// recorded pid that is provably dead proves an early crash worth fast-failing before
		// the window elapses; otherwise the run is caught once it ages past the window.
		const withinStartupGrace = now - run.startedAt <= CLI_ACTIVE_RUN_STALE_MS;
		if (withinStartupGrace && (run.pid === null || isPidAlive(run.pid))) continue;
		const errorMessage = 'Run process exited before writing a heartbeat; reconciled to failed.';
		let outcome: HeartbeatWriteOutcome;
		try {
			outcome = await withSqliteRetry(
				() =>
					ctx.commands.reconcileDeadRun({
						completedAt: now,
						errorMessage,
						exitCode: RECONCILED_EXIT_CODE,
						runId: run.id,
						stopReason: 'process_exit',
					}),
				{ label: 'run.sweepOrphaned.deadPid' },
			);
		} catch (err) {
			webLogger.warn({ err, runId: run.id }, 'Failed to reconcile orphaned run');
			continue;
		}
		if (outcome.kind !== 'updated') continue;
		// The dead CLI never cleaned up its worktree; reap it so an orphaned run leaves no
		// branch + checkout behind. Gracefully parked runs aren't orphans (they wrote a
		// terminal heartbeat), so this never touches a deliberately-preserved worktree.
		if (run.worktreePath) {
			await reapRunWorktree(run.projectPath, run.worktreePath, run.worktreeBranch);
		}
		// The dead process never released its cross-run feature leases (a hard death skips
		// in-process release); this reap is the release of record. Keyed by the dead run's id,
		// so it applies to live-tree runs too and never touches a live run's lease.
		const reapedLeases = await reapRunFeatureLeases(run.projectPath, run.id);
		if (reapedLeases > 0) {
			webLogger.warn(
				{ count: reapedLeases, runId: run.id },
				'Reaped feature leases held by dead run',
			);
		}
		if (run.mode === 'audit') ctx.onProjectChanged?.(run.projectPath);
		ctx.hub.broadcast({
			payload: {
				error: errorMessage,
				exitCode: RECONCILED_EXIT_CODE,
				status: 'failed',
				stopReason: 'process_exit',
			},
			runId: run.id,
			type: 'run_status',
		});
		swept.push({
			completedAt: now,
			durationMs: now - run.startedAt,
			errorMessage,
			runId: run.id,
			source: run.source,
		});
	}
	if (swept.length > 0) {
		webLogger.warn(
			{ count: swept.length },
			'Swept orphaned runs whose process died before heartbeat to failed',
		);
	}
	return swept;
}
