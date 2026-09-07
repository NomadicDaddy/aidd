import type { WebDatabase } from '../../db/client.ts';

import { webLogger } from '../../logger.ts';
import { sweepRetention } from './cleanup.ts';

const MIN_SWEEP_INTERVAL_MS = 15 * 60 * 1_000;

export interface RetentionScheduler {
	request: () => void;
	run: () => Promise<void>;
}

/**
 * Coalesce terminal-lifecycle requests so cleanup stays prompt without scanning on every row.
 * @param db Database whose terminal history is pruned.
 * @param dataDir Root containing run transcripts.
 * @returns An immediate sweep and a coalesced lifecycle request hook.
 */
export function createRetentionScheduler(db: WebDatabase, dataDir: string): RetentionScheduler {
	let lastStartedAt = 0;
	let running = false;
	const run = async (): Promise<void> => {
		const now = Date.now();
		if (running || now - lastStartedAt < MIN_SWEEP_INTERVAL_MS) return;
		running = true;
		lastStartedAt = now;
		try {
			const result = await sweepRetention(db, dataDir, now);
			if (
				result.transcripts.removed > 0 ||
				result.history.invocations > 0 ||
				result.history.runs > 0 ||
				result.history.pipelineSessions > 0
			) {
				webLogger.info({ result }, 'Applied local execution retention policy');
			}
		} catch (err) {
			webLogger.warn({ err }, 'Execution retention sweep failed');
		} finally {
			running = false;
		}
	};
	return { request: (): void => void run(), run };
}
