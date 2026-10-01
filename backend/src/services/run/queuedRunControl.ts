import { and, eq } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { WebSocketHub } from '../../webSocketHub.ts';

import { withSqliteRetry } from '../../db/retry.ts';
import { runs } from '../../db/schema.ts';
import { RunControlError } from './types.ts';

interface QueuedRunCancel {
	exitCode: number;
	label: string;
	status: 'killed' | 'stopped';
	stopReason: string;
}

// Cancels a run that is still waiting for a ceiling slot. Nothing has been spawned, so the row is
// the whole run and one guarded write ends it.
//
// Admission can promote the row between the caller's read and this write. The write then matches
// nothing and the run is starting, so announcing a cancel would be false: the caller is told and
// can act on the running run instead.
export async function terminalizeQueuedRun(
	ctx: { db: WebDatabase; hub: WebSocketHub },
	run: { id: string; startedAt: number },
	input: QueuedRunCancel,
	syncInvocation: () => Promise<void>,
): Promise<void> {
	const completedAt = Date.now();
	const updated = await withSqliteRetry(
		() =>
			ctx.db
				.update(runs)
				.set({
					completedAt,
					durationMs: completedAt - run.startedAt,
					exitCode: input.exitCode,
					status: input.status,
					stopReason: input.stopReason,
				})
				.where(and(eq(runs.id, run.id), eq(runs.status, 'queued')))
				.returning({ id: runs.id }),
		{ label: input.label },
	);
	if (updated.length === 0) {
		throw new RunControlError(
			`Run started while it was being cancelled; it is no longer queued: ${run.id}`,
			409,
		);
	}
	await syncInvocation();
	ctx.hub.broadcast({
		payload: {
			exitCode: input.exitCode,
			status: input.status,
			stopReason: input.stopReason,
		},
		runId: run.id,
		type: 'run_status',
	});
}
