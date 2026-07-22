import { and, gte, inArray } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { OutputTimeseriesPoint } from './types.ts';

import { runs } from '../../db/schema.ts';
import { TERMINAL_STATUSES } from '../run/types.ts';

// Sums per-run output metrics (git lines added/removed, token usage) into time buckets, straight
// off the `runs` table — no invocation join, since the metrics live on the run row itself. JS
// bucketing keeps the shape consistent with aggregation.ts getTimeseries. NULL metrics (runs that
// predate capture, commit-less runs) are excluded from the sums but still counted in `runs`, with
// the runsWith*Data counters telling the UI how complete each bucket is.
export async function getOutputTimeseries(
	db: WebDatabase,
	input: {
		bucket: 'day' | 'hour';
		windowMs?: number | undefined;
	}
): Promise<OutputTimeseriesPoint[]> {
	const bucketMs = input.bucket === 'hour' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
	const filters = [inArray(runs.status, [...TERMINAL_STATUSES])];
	if (input.windowMs !== undefined) {
		filters.push(gte(runs.startedAt, Date.now() - input.windowMs));
	}
	const rows = await db
		.select({
			cachedTokens: runs.cachedTokens,
			filesChanged: runs.filesChanged,
			inputTokens: runs.inputTokens,
			linesAdded: runs.linesAdded,
			linesRemoved: runs.linesRemoved,
			outputTokens: runs.outputTokens,
			reasoningTokens: runs.reasoningTokens,
			startedAt: runs.startedAt,
		})
		.from(runs)
		.where(and(...filters));

	const points = new Map<number, OutputTimeseriesPoint>();
	for (const row of rows) {
		const bucketKey = Math.floor(row.startedAt / bucketMs) * bucketMs;
		let point = points.get(bucketKey);
		if (!point) {
			point = {
				bucket: bucketKey,
				cachedTokens: 0,
				filesChanged: 0,
				inputTokens: 0,
				linesAdded: 0,
				linesRemoved: 0,
				outputTokens: 0,
				reasoningTokens: 0,
				runs: 0,
				runsWithFileData: 0,
				runsWithLineData: 0,
				runsWithTokenData: 0,
			};
			points.set(bucketKey, point);
		}
		point.runs += 1;
		if (row.linesAdded !== null || row.linesRemoved !== null) {
			point.runsWithLineData += 1;
			point.linesAdded += row.linesAdded ?? 0;
			point.linesRemoved += row.linesRemoved ?? 0;
		}
		if (row.filesChanged !== null) {
			point.runsWithFileData += 1;
			point.filesChanged += row.filesChanged;
		}
		if (row.inputTokens !== null || row.outputTokens !== null) {
			point.runsWithTokenData += 1;
			point.cachedTokens += row.cachedTokens ?? 0;
			point.inputTokens += row.inputTokens ?? 0;
			point.outputTokens += row.outputTokens ?? 0;
			point.reasoningTokens += row.reasoningTokens ?? 0;
		}
	}
	return [...points.values()].sort((left, right) => left.bucket - right.bucket);
}
