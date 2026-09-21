import { webLogger } from '../../logger.ts';
import {
	ADMISSION_INTERVAL_MS,
	INGEST_INTERVAL_MS,
	ORPHAN_RUN_SWEEP_INTERVAL_MS,
} from './types.ts';

export interface RunServiceTimerDeps {
	admitQueuedRuns(): Promise<void>;
	ingestCompletedCliRuns(): Promise<number>;
	isDisposed(): boolean;
	reconcileRunLedgerDrift(): Promise<number>;
	requestRetentionSweep(): void;
	sweepOrphanedRuns(): Promise<number>;
}

export interface RunServiceTimers {
	admissionTimer: ReturnType<typeof setInterval>;
	ingestTimer: ReturnType<typeof setInterval>;
	orphanSweepTimer: ReturnType<typeof setInterval>;
}

// Wire the two periodic RunService background jobs (CLI-run ingestion + orphan sweep). Kept out
// of the constructor so the timer cadence and guard logic stay in one place; the returned handles
// are cleared in markDisposed.
export function startRunServiceTimers(deps: RunServiceTimerDeps): RunServiceTimers {
	const ingestTimer = setInterval(() => {
		if (deps.isDisposed()) return;
		void deps.ingestCompletedCliRuns().catch((error: unknown) => {
			webLogger.error({ error }, 'Periodic CLI run ingestion failed');
		});
		// A ledger line can land moments after the DB row terminalizes (the CLI writes it
		// during finalization), so drift repair rides the same cadence. Cheap when clean:
		// one SELECT that short-circuits with no candidates.
		void deps.reconcileRunLedgerDrift().catch((error: unknown) => {
			webLogger.error({ error }, 'Periodic run ledger-drift reconcile failed');
		});
		deps.requestRetentionSweep();
	}, INGEST_INTERVAL_MS);
	ingestTimer.unref?.();
	// HeartbeatWatcher only sees runs that wrote a heartbeat file; a run whose process dies
	// during early CLI startup leaves none and would sit 'running' until the next restart.
	// This sweep is the in-session safety net that force-fails those orphans.
	const orphanSweepTimer = setInterval(() => {
		if (deps.isDisposed()) return;
		void deps.sweepOrphanedRuns().catch((error: unknown) => {
			webLogger.error({ error }, 'Periodic orphaned-run sweep failed');
		});
		deps.requestRetentionSweep();
	}, ORPHAN_RUN_SWEEP_INTERVAL_MS);
	orphanSweepTimer.unref?.();
	const admissionTimer = setInterval(() => {
		if (deps.isDisposed()) return;
		void deps.admitQueuedRuns().catch((error: unknown) => {
			webLogger.error({ error }, 'Periodic queued-run admission failed');
		});
	}, ADMISSION_INTERVAL_MS);
	admissionTimer.unref?.();
	return { admissionTimer, ingestTimer, orphanSweepTimer };
}
