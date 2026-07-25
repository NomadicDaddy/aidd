import { eq } from 'drizzle-orm';

import type { LocalTransaction, ReconcileInvocationFromRunArgs } from './types.ts';

import { invocationEvents, runs } from '../schema.ts';

// invocation_events.status has a narrower CHECK than runs.status (no 'waiting_approval'). A parked
// run mirrors as 'stopped' — a neutral terminal — in the unified invocation/telemetry log; the
// precise parked status lives on the runs row and the derived outcome (aidd-shared/runs/outcome).
function invocationStatusFromRunStatus(status: string): string {
	return status === 'waiting_approval' ? 'stopped' : status;
}

// Copy a run's authoritative terminal facts (status, exit code, timing, error) onto every
// invocation_events row linked to it by run_id. Idempotent and unguarded: it is the single
// reconciliation path that keeps the telemetry ledger in lockstep with the `runs` row at every
// terminal transition (heartbeat terminalize/stale, direct stop/kill, orphan sweep) and right
// after recordStart to close the fast-run race where completion fires before the row is inserted.
// Runs is the source of truth — no derived outcome label is stored. Returns the row count touched
// (0 when the run is unknown or carries no telemetry row, e.g. direct-CLI runs).
export function reconcileInvocationFromRun(
	tx: LocalTransaction,
	args: ReconcileInvocationFromRunArgs,
): number {
	const { runId } = args;
	const run = tx
		.select({
			completedAt: runs.completedAt,
			durationMs: runs.durationMs,
			errorMessage: runs.errorMessage,
			exitCode: runs.exitCode,
			status: runs.status,
		})
		.from(runs)
		.where(eq(runs.id, runId))
		.get();
	if (!run) return 0;
	// While the run is still running there is nothing terminal to copy, and the invocation row is
	// already 'running'. Skip so a post-recordStart sync on a live run is a true no-op (no redundant
	// write, no spurious data-movement trace). Terminal-transition callers run after the runs row is
	// terminal, so they are unaffected.
	if (run.status === 'running') return 0;
	const targets = tx
		.select({ id: invocationEvents.id })
		.from(invocationEvents)
		.where(eq(invocationEvents.runId, runId))
		.all();
	if (targets.length === 0) return 0;
	tx.update(invocationEvents)
		.set({
			completedAt: run.completedAt,
			durationMs: run.durationMs,
			errorMessage: run.errorMessage,
			exitCode: run.exitCode,
			status: invocationStatusFromRunStatus(run.status),
		})
		.where(eq(invocationEvents.runId, runId))
		.run();
	return targets.length;
}

export function reconcileStaleInvocations(tx: LocalTransaction, args: { now: number }): number {
	const { now } = args;
	const stale = tx
		.select({
			id: invocationEvents.id,
			runId: invocationEvents.runId,
			startedAt: invocationEvents.startedAt,
		})
		.from(invocationEvents)
		.where(eq(invocationEvents.status, 'running'))
		.all();
	let reconciled = 0;
	for (const row of stale) {
		// Run-backed rows defer to the authoritative `runs` row, which reconcileStaleRuns has
		// already driven terminal (or left 'running' for a genuinely resumed run). A still-running
		// run means it resumed — leave the invocation running too rather than force-failing a live
		// run's telemetry.
		if (row.runId) {
			const run = tx
				.select({
					completedAt: runs.completedAt,
					durationMs: runs.durationMs,
					errorMessage: runs.errorMessage,
					exitCode: runs.exitCode,
					status: runs.status,
				})
				.from(runs)
				.where(eq(runs.id, row.runId))
				.get();
			if (run) {
				if (run.status === 'running') continue;
				tx.update(invocationEvents)
					.set({
						completedAt: run.completedAt ?? now,
						durationMs: run.durationMs ?? now - row.startedAt,
						errorMessage: run.errorMessage,
						exitCode: run.exitCode,
						status: invocationStatusFromRunStatus(run.status),
					})
					.where(eq(invocationEvents.id, row.id))
					.run();
				reconciled++;
				continue;
			}
		}
		// No run linkage (skill/recipe) or the run row is gone: the invocation cannot be
		// resumed, so force it failed as before.
		tx.update(invocationEvents)
			.set({
				completedAt: now,
				durationMs: now - row.startedAt,
				errorMessage: 'Invocation was active during web startup and cannot be resumed.',
				status: 'failed',
			})
			.where(eq(invocationEvents.id, row.id))
			.run();
		reconciled++;
	}
	return reconciled;
}
