import { and, desc, eq, gt, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { basename } from 'node:path';

import type { RunRecord, WebRunStatus } from '../../types.ts';

import { withSqliteRetry } from '../../db/retry.ts';
import { runs } from '../../db/schema.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';
import { clampLimit, type CursorPage, decodeCursor, encodeCursor } from '../pagination.ts';
import { listCliActiveRuns, listCliActiveRunsForProject } from './cliActiveRuns.ts';
import { reconcileCliPipelineSessions } from './cliPipelineSessionReconcile.ts';
import { listDirectorCycleRunRecords } from './directorCycleRuns.ts';
import { dropLedgerPhantomRuns } from './ledgerReconcile.ts';
import { type QueriesContext, toWebRunRecord } from './queries.ts';
import { annotateStopRequested } from './stopRequestedAnnotation.ts';
import { NON_TERMINAL_RUN_STATUSES, RECENT_RUN_LOOKBACK_MS } from './types.ts';

export interface ListRunsPageOptions {
	cursor?: string;
	limit?: number;
	status?: WebRunStatus;
	// Exclude pipeline-owned runs — the unified Runs feed shows those only inside their
	// session's step rows. CLI/director rows never carry a session id, so SQL suffices.
	topLevel?: boolean;
}

function topLevelFilter(topLevel: boolean | undefined): SQL | undefined {
	return topLevel ? isNull(runs.pipelineSessionId) : undefined;
}

function statusOrRecentFilter(status: undefined | WebRunStatus): SQL | undefined {
	if (status) return eq(runs.status, status);
	const cutoff = Date.now() - RECENT_RUN_LOOKBACK_MS;
	return or(inArray(runs.status, [...NON_TERMINAL_RUN_STATUSES]), gt(runs.startedAt, cutoff));
}

function cursorFilter(cursor: string | undefined): SQL | undefined {
	const decoded = decodeCursor(cursor);
	if (!decoded) return undefined;
	return or(
		lt(runs.startedAt, decoded.startedAt),
		and(eq(runs.startedAt, decoded.startedAt), lt(runs.id, decoded.id)),
	);
}

function combineFilters(...filters: (SQL | undefined)[]): SQL | undefined {
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
function projectPathFilter(projectPath: string): SQL {
	const normalizedColumn = sql`replace(${runs.projectPath}, '/', '\\')`;
	const target = projectPath.replaceAll('/', '\\');
	return process.platform === 'win32'
		? sql`lower(${normalizedColumn}) = ${target.toLowerCase()}`
		: sql`${normalizedColumn} = ${target}`;
}

function mergeWebAndCliRuns(webItems: RunRecord[], cliItems: RunRecord[]): RunRecord[] {
	const webRunIds = new Set(webItems.map((run) => run.id));
	return [...webItems, ...cliItems.filter((run) => !webRunIds.has(run.id))];
}

export async function listRuns(
	ctx: QueriesContext,
	limit = 100,
	status?: WebRunStatus,
): Promise<RunRecord[]> {
	const cutoff = Date.now() - RECENT_RUN_LOOKBACK_MS;
	const webRuns = await ctx.db
		.select()
		.from(runs)
		.where(
			status
				? eq(runs.status, status)
				: or(
						inArray(runs.status, [...NON_TERMINAL_RUN_STATUSES]),
						gt(runs.startedAt, cutoff),
					),
		)
		.orderBy(desc(runs.startedAt));
	const webItems = webRuns.map((run) => toWebRunRecord(run));
	const cliRuns = !status || status === 'running' ? await listCliActiveRuns(ctx) : [];
	const directorRuns = await listDirectorCycleRunRecords(ctx, status);
	return annotateStopRequested(
		mergeWebAndCliRuns(mergeWebAndCliRuns(webItems, directorRuns), cliRuns)
			.sort((left, right) => right.startedAt - left.startedAt)
			.slice(0, limit),
	);
}

export async function listRunsForProject(
	ctx: QueriesContext,
	projectPath: string,
	limit = 20,
	status?: WebRunStatus,
): Promise<RunRecord[]> {
	const cutoff = Date.now() - RECENT_RUN_LOOKBACK_MS;
	const webRuns = await ctx.db
		.select()
		.from(runs)
		.where(
			and(
				projectPathFilter(projectPath),
				status
					? eq(runs.status, status)
					: or(
							inArray(runs.status, [...NON_TERMINAL_RUN_STATUSES]),
							gt(runs.startedAt, cutoff),
						),
			),
		)
		.orderBy(desc(runs.startedAt));
	if (status && status !== 'running') {
		return webRuns.map((run) => toWebRunRecord(run)).slice(0, limit);
	}
	const webItems = webRuns.map((run) => toWebRunRecord(run));
	const cliRuns = await listCliActiveRunsForProject(projectPath);
	return annotateStopRequested(
		mergeWebAndCliRuns(webItems, cliRuns)
			.sort((left, right) => right.startedAt - left.startedAt)
			.slice(0, limit),
	);
}

// Cursor pagination flows web-supervised rows only; CLI heartbeat rows are filesystem-scanned
// and surfaced only on the first page (no cursor). The next-page cursor is keyed off the last
// returned web row — that keeps the live CLI surface unchanged across "Show more" clicks.
export async function listRunsPage(
	ctx: QueriesContext,
	options: ListRunsPageOptions = {},
): Promise<CursorPage<RunRecord>> {
	const limit = clampLimit(options.limit);
	const isFirstPage = options.cursor === undefined || options.cursor === '';
	const where = combineFilters(
		statusOrRecentFilter(options.status),
		cursorFilter(options.cursor),
		topLevelFilter(options.topLevel),
	);
	const webRowsRaw = await ctx.db
		.select()
		.from(runs)
		.where(where)
		.orderBy(desc(runs.startedAt), desc(runs.id))
		.limit(limit + 1);
	const hasNext = webRowsRaw.length > limit;
	const webPage = webRowsRaw.slice(0, limit);
	const webItems = webPage.map((row) => toWebRunRecord(row));
	const cliItems =
		isFirstPage && (!options.status || options.status === 'running')
			? await listCliActiveRuns(ctx)
			: [];
	const listedCliItems = await reconcileCliPipelineSessions(ctx, cliItems, options.topLevel);
	const directorItems = isFirstPage ? await listDirectorCycleRunRecords(ctx, options.status) : [];
	const items = await annotateStopRequested(
		await dropLedgerPhantomRuns(
			mergeWebAndCliRuns(mergeWebAndCliRuns(webItems, directorItems), listedCliItems).sort(
				(left, right) => right.startedAt - left.startedAt,
			),
		),
	);
	const lastWebRow = webPage[webPage.length - 1];
	const nextCursor =
		hasNext && lastWebRow
			? encodeCursor({ id: lastWebRow.id, startedAt: lastWebRow.startedAt })
			: null;
	return { items, nextCursor };
}
export async function listRunsForProjectPage(
	ctx: QueriesContext,
	projectPath: string,
	options: ListRunsPageOptions = {},
): Promise<CursorPage<RunRecord>> {
	const limit = clampLimit(options.limit);
	const isFirstPage = options.cursor === undefined || options.cursor === '';
	// The project-path predicate runs in SQL (see projectPathFilter), so the started_at-ordered
	// scan stops at limit + 1 matched rows and the probe row determines hasNext directly, instead
	// of over-fetching the whole time-sorted window and matching paths in memory.
	const where = combineFilters(
		projectPathFilter(projectPath),
		statusOrRecentFilter(options.status),
		cursorFilter(options.cursor),
		topLevelFilter(options.topLevel),
	);
	const webRowsRaw = await ctx.db
		.select()
		.from(runs)
		.where(where)
		.orderBy(desc(runs.startedAt), desc(runs.id))
		.limit(limit + 1);
	const hasNext = webRowsRaw.length > limit;
	const webPage = webRowsRaw.slice(0, limit);
	const webItems = webPage.map((row) => toWebRunRecord(row));
	const cliItems =
		isFirstPage && (!options.status || options.status === 'running')
			? await listCliActiveRunsForProject(projectPath)
			: [];
	const listedCliItems = await reconcileCliPipelineSessions(ctx, cliItems, options.topLevel);
	const items = await annotateStopRequested(
		await dropLedgerPhantomRuns(
			mergeWebAndCliRuns(webItems, listedCliItems).sort(
				(left, right) => right.startedAt - left.startedAt,
			),
		),
	);
	const lastWebRow = webPage[webPage.length - 1];
	const nextCursor =
		hasNext && lastWebRow
			? encodeCursor({ id: lastWebRow.id, startedAt: lastWebRow.startedAt })
			: null;
	return { items, nextCursor };
}
export async function hasActiveRunForProject(
	ctx: QueriesContext,
	projectPath: string,
): Promise<boolean> {
	return (await listRunsForProject(ctx, projectPath, 1, 'running')).length > 0;
}

export async function latestProjectAuditRun(
	ctx: QueriesContext,
	projectPath: string,
): Promise<{
	finishedAt: null | number;
	runId: string;
	status: WebRunStatus;
} | null> {
	// Filter by mode + project in SQL before ordering so the single newest audit run for THIS
	// project is selected directly. The previous global "newest 50 audit runs, then match in
	// memory" could miss a project's latest audit once 50 newer audit runs existed elsewhere.
	const match = (
		await ctx.db
			.select({
				completedAt: runs.completedAt,
				id: runs.id,
				status: runs.status,
			})
			.from(runs)
			.where(and(eq(runs.mode, 'audit'), projectPathFilter(projectPath)))
			.orderBy(desc(runs.startedAt))
			.limit(1)
	)[0];
	if (!match) return null;
	return {
		finishedAt: match.completedAt,
		runId: match.id,
		status: match.status as WebRunStatus,
	};
}

export async function updateProjectPathReferences(
	ctx: QueriesContext,
	sourcePath: string,
	destinationPath: string,
): Promise<void> {
	const projectName = basename(destinationPath);
	// Rename across both tables atomically so a reader never sees runs moved but sessions not.
	await withSqliteRetry(
		() =>
			ctx.commands.updateProjectPathReferences({ destinationPath, projectName, sourcePath }),
		{ label: 'project.path.update' },
	);
	recordDataMovement({
		category: 'database',
		operation: 'project.path.update',
		status: 'success',
		summary: { destinationPath, sourcePath },
		target: 'runs,pipeline_sessions',
	});
}

// Purge every path-keyed run/pipeline/invocation row for a project_path. Called at the project
// create/delete lifecycle boundary so a folder recreated fresh at a reused path (or a deleted
// project) never leaves prior rows behind for the project Runs tab to surface. Returns the number
// of run rows removed; the data-movement trace is recorded only when something was actually purged.
export async function purgeProjectRuns(ctx: QueriesContext, projectPath: string): Promise<number> {
	const purgedRuns = await withSqliteRetry(() => ctx.commands.purgeProjectRuns({ projectPath }), {
		label: 'project.runs.purge',
	});
	if (purgedRuns > 0) {
		recordDataMovement({
			category: 'database',
			operation: 'project.runs.purge',
			status: 'success',
			summary: { projectPath, purgedRuns },
			target: 'runs,pipeline_sessions,invocation_events',
		});
	}
	return purgedRuns;
}
