import type { WebRunStatus } from '../../types.ts';

import { type runs } from '../../db/schema.ts';

export async function waitForTerminalStatus(
	getRun: (runId: string) => Promise<typeof runs.$inferSelect | undefined>,
	runId: string,
	options: { pollIntervalMs?: number; timeoutMs?: number } = {},
): Promise<WebRunStatus> {
	const pollIntervalMs = options.pollIntervalMs ?? 1000;
	const deadline =
		options.timeoutMs !== undefined ? Date.now() + options.timeoutMs : Number.POSITIVE_INFINITY;
	for (;;) {
		const row = await getRun(runId);
		if (!row) throw new Error(`Run not found: ${runId}`);
		const status = row.status as WebRunStatus;
		if (status !== 'running') return status;
		if (Date.now() >= deadline) {
			throw new Error(`Timed out waiting for terminal status: ${runId}`);
		}
		await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
	}
}
