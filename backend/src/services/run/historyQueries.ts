import { and, desc, eq, gt, inArray, or } from 'drizzle-orm';
import { basename } from 'node:path';

import type { RunRecord, WebRunStatus } from '../../types.ts';

import { withSqliteRetry } from '../../db/retry.ts';
import { runs } from '../../db/schema.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';
import { clampLimit, type CursorPage, encodeCursor } from '../pagination.ts';
import { listCliActiveRuns, listCliActiveRunsForProject } from './cliActiveRuns.ts';
import { reconcileCliPipelineSessions } from './cliPipelineSessionReconcile.ts';
import { listDirectorCycleRunRecords } from './directorCycleRuns.ts';
import {
	combineFilters,
	cursorFilter,
	mergeWebAndCliRuns,
	projectPathFilter,
	statusOrRecentFilter,
	topLevelFilter,
} from './historyQueryHelpers.ts';
import { readRunHistorySources } from './historySourceReads.ts';
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

export async function listRuns(
	ctx: QueriesContext,
	limit = 100,
	status?: WebRunStatus,
): Promise<RunRecord[]> {
	const cutoff = Date.now() - RECENT_RUN_LOOKBACK_MS;
	const { cliItems, directorItems, webItems } = await readRunHistorySources({
		cli: () =>
			!status || status === 'running'
				? listCliActiveRuns(ctx)
				: Promise.resolve<RunRecord[]>([]),
		director: () => listDirectorCycleRunRecords(ctx, status),
		web: async () =>
			(
				await ctx.db
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
					.orderBy(desc(runs.startedAt))
			).map((run) => toWebRunRecord(run)),
	});
	return annotateStopRequested(
		mergeWebAndCliRuns(mergeWebAndCliRuns(webItems, directorItems), cliItems)
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
	const { cliItems, webItems } = await readRunHistorySources({
		cli: () =>
			!status || status === 'running'
				? listCliActiveRunsForProject(projectPath)
				: Promise.resolve<RunRecord[]>([]),
		director: () => Promise.resolve<RunRecord[]>([]),
		web: async () =>
			(
				await ctx.db
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
					.orderBy(desc(runs.startedAt))
			).map((run) => toWebRunRecord(run)),
	});
	if (status && status !== 'running') {
		return webItems.slice(0, limit);
	}
	return annotateStopRequested(
		mergeWebAndCliRuns(webItems, cliItems)
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
	const {
		cliItems,
		directorItems,
		webItems: webRowsRaw,
	} = await readRunHistorySources({
		cli: () =>
			isFirstPage && (!options.status || options.status === 'running')
				? listCliActiveRuns(ctx)
				: Promise.resolve<RunRecord[]>([]),
		director: () =>
			isFirstPage
				? listDirectorCycleRunRecords(ctx, options.status)
				: Promise.resolve<RunRecord[]>([]),
		web: async () =>
			ctx.db
				.select()
				.from(runs)
				.where(where)
				.orderBy(desc(runs.startedAt), desc(runs.id))
				.limit(limit + 1),
	});
	const hasNext = webRowsRaw.length > limit;
	const webPage = webRowsRaw.slice(0, limit);
	const webItems = webPage.map((row) => toWebRunRecord(row));
	const listedCliItems = await reconcileCliPipelineSessions(ctx, cliItems, options.topLevel);
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
	const { cliItems, webItems: webRowsRaw } = await readRunHistorySources({
		cli: () =>
			isFirstPage && (!options.status || options.status === 'running')
				? listCliActiveRunsForProject(projectPath)
				: Promise.resolve<RunRecord[]>([]),
		director: () => Promise.resolve<RunRecord[]>([]),
		web: async () =>
			ctx.db
				.select()
				.from(runs)
				.where(where)
				.orderBy(desc(runs.startedAt), desc(runs.id))
				.limit(limit + 1),
	});
	const hasNext = webRowsRaw.length > limit;
	const webPage = webRowsRaw.slice(0, limit);
	const webItems = webPage.map((row) => toWebRunRecord(row));
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
