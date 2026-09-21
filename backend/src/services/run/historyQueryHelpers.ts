import { and, eq, gt, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';

import type { RunRecord, WebRunStatus } from '../../types.ts';

import { runs } from '../../db/schema.ts';
import { decodeCursor } from '../pagination.ts';
import { IN_FLIGHT_RUN_STATUSES, RECENT_RUN_LOOKBACK_MS } from './types.ts';

export function topLevelFilter(topLevel: boolean | undefined): SQL | undefined {
	return topLevel ? isNull(runs.pipelineSessionId) : undefined;
}

export function statusOrRecentFilter(status: undefined | WebRunStatus): SQL | undefined {
	if (status) return eq(runs.status, status);
	const cutoff = Date.now() - RECENT_RUN_LOOKBACK_MS;
	return or(inArray(runs.status, [...IN_FLIGHT_RUN_STATUSES]), gt(runs.startedAt, cutoff));
}

export function cursorFilter(cursor: string | undefined): SQL | undefined {
	const decoded = decodeCursor(cursor);
	if (!decoded) return undefined;
	return or(
		lt(runs.startedAt, decoded.startedAt),
		and(eq(runs.startedAt, decoded.startedAt), lt(runs.id, decoded.id)),
	);
}

export function combineFilters(...filters: (SQL | undefined)[]): SQL | undefined {
	const present = filters.filter((value): value is SQL => value !== undefined);
	if (present.length === 0) return undefined;
	if (present.length === 1) return present[0];
	return and(...present);
}

// SQL mirror of normalizeComparablePath()/pathsMatch(): every platform folds '/' to '\', and
// win32 compares case-insensitively. Pushing that normalization into the WHERE clause lets the
// database filter to the requested project and stop early (the started_at-ordered scan returns
// only the matching rows) instead of reading every recent run into memory for a pathsMatch() pass
// — and lets latestProjectAuditRun select the project's newest audit directly rather than scanning
// a global window. The binary idx_runs_project_path index cannot serve the win32 case-fold, so
// this is an intentional filtered scan; the gain is bounding the result set in SQL rather than in
// memory (and fixing the correctness bug where latestProjectAuditRun missed a project's newest run).
export function projectPathFilter(projectPath: string): SQL {
	const normalizedColumn = sql`replace(${runs.projectPath}, '/', '\\')`;
	const target = projectPath.replaceAll('/', '\\');
	return process.platform === 'win32'
		? sql`lower(${normalizedColumn}) = ${target.toLowerCase()}`
		: sql`${normalizedColumn} = ${target}`;
}

export function mergeWebAndCliRuns(webItems: RunRecord[], cliItems: RunRecord[]): RunRecord[] {
	const webRunIds = new Set(webItems.map((run) => run.id));
	return [...webItems, ...cliItems.filter((run) => !webRunIds.has(run.id))];
}
