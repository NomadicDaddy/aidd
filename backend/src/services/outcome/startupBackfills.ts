import type { WebDatabase } from '../../db/client.ts';

import { webLogger } from '../../logger.ts';
import { backfillRunCosts, backfillRunOutputMetrics } from '../run/outputMetricsBackfill.ts';
import { backfillProjectPathIdentity } from './projectPathIdentityBackfill.ts';
import { sweepRevertedCommits } from './revertDetection.ts';

/**
 * Starts best-effort historical outcome backfills without delaying server startup. The project
 * path rewrite runs before the revert sweep so the sweep groups rows by one spelling per project.
 * @param db
 */
export function startOutcomeBackfills(db: WebDatabase): void {
	void backfillRunOutputMetrics(db).catch((error: unknown) => {
		webLogger.warn({ error }, 'Run output-metrics backfill failed');
	});
	void backfillRunCosts(db).catch((error: unknown) => {
		webLogger.warn({ error }, 'Run-cost backfill failed');
	});
	void backfillProjectPathIdentity(db)
		.catch((error: unknown) => {
			webLogger.warn({ error }, 'Project path identity backfill failed');
		})
		.then(() => sweepRevertedCommits(db))
		.catch((error: unknown) => {
			webLogger.warn({ error }, 'Run revert-detection sweep failed');
		});
}
