import { and, desc, eq, lt, not, like, or, sql, type Column, type SQL } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { WebDatabase } from '../../db/client.ts';

import { directorCycles, invocationEvents, pipelineSessions, runs } from '../../db/schema.ts';
import { clampLimit, type CursorPage, decodeCursor, encodeCursor } from '../pagination.ts';

// Server-side union of the activity sources behind the Dev Diary timeline. Each source is
// queried with the same (started_at DESC, id DESC) cursor window the runs/sessions endpoints use,
// merged, de-duplicated, and paged. Composing this client-side is not possible: the run row a
// web-launched skill produces is a duplicate of that skill's invocation row, and only
// the server sees the run_id link that lets us drop it.

type DiaryTimelineKind = 'director-cycle' | 'recipe-session' | 'release' | 'run' | 'skill';

export interface DiaryTimelineItem {
	completedAt: null | number;
	detail: null | string;
	durationMs: null | number;
	id: string;
	kind: DiaryTimelineKind;
	mode: null | string;
	projectName: null | string;
	projectPath: null | string;
	startedAt: number;
	status: string;
	title: string;
}

export interface TimelineContext {
	db: WebDatabase;
	rootDir: string;
}

export interface ListTimelineOptions {
	cursor?: string;
	limit?: number;
	projectPath?: string;
}

// Cap of CHANGELOG releases surfaced on the global feed's first page. Mirrors the bounded
// filesystem merge listRunsPage applies to CLI heartbeat rows.
const MAX_RELEASES = 20;
const RELEASE_HEADING = /^##\s+\[(\d{4}-\d{2}-\d{2})\]\s*-\s*(.+)$/;

function cursorFilterFor(
	startedAtCol: Column,
	idCol: Column,
	cursor: string | undefined
): SQL | undefined {
	const decoded = decodeCursor(cursor);
	if (!decoded) return undefined;
	return or(
		lt(startedAtCol, decoded.startedAt),
		and(eq(startedAtCol, decoded.startedAt), lt(idCol, decoded.id))
	);
}

// SQL mirror of normalizeComparablePath(): fold '/'→'\' everywhere and compare case-insensitively
// on win32. Matches projectPathFilter in run/historyQueries.ts so the diary timeline scopes to a
// project the same way the Runs tab does.
function projectPathFilterFor(column: Column, projectPath: string): SQL {
	const normalizedColumn = sql`replace(${column}, '/', '\\')`;
	const target = projectPath.replaceAll('/', '\\');
	return process.platform === 'win32'
		? sql`lower(${normalizedColumn}) = ${target.toLowerCase()}`
		: sql`${normalizedColumn} = ${target}`;
}

function combine(...filters: (SQL | undefined)[]): SQL | undefined {
	const present = filters.filter((value): value is SQL => value !== undefined);
	if (present.length === 0) return undefined;
	if (present.length === 1) return present[0];
	return and(...present);
}

async function queryRuns(
	ctx: TimelineContext,
	options: ListTimelineOptions,
	limit: number
): Promise<DiaryTimelineItem[]> {
	const where = combine(
		options.projectPath
			? projectPathFilterFor(runs.projectPath, options.projectPath)
			: undefined,
		cursorFilterFor(runs.startedAt, runs.id, options.cursor)
	);
	const rows = await ctx.db
		.select()
		.from(runs)
		.where(where)
		.orderBy(desc(runs.startedAt), desc(runs.id))
		.limit(limit);
	return rows.map((row) => ({
		completedAt: row.completedAt,
		detail: row.aiSummary ?? row.summary ?? row.errorMessage,
		durationMs: row.durationMs,
		id: row.id,
		kind: 'run',
		mode: row.mode,
		projectName: row.projectName,
		projectPath: row.projectPath,
		startedAt: row.startedAt,
		status: row.status,
		title: `${row.mode} · ${row.projectName}`,
	}));
}

async function querySkills(
	ctx: TimelineContext,
	options: ListTimelineOptions,
	limit: number
): Promise<{ items: DiaryTimelineItem[]; runIds: Set<string> }> {
	const where = combine(
		eq(invocationEvents.resourceType, 'skill'),
		options.projectPath
			? projectPathFilterFor(invocationEvents.projectPath, options.projectPath)
			: undefined,
		cursorFilterFor(invocationEvents.startedAt, invocationEvents.id, options.cursor)
	);
	const rows = await ctx.db
		.select()
		.from(invocationEvents)
		.where(where)
		.orderBy(desc(invocationEvents.startedAt), desc(invocationEvents.id))
		.limit(limit);
	const runIds = new Set<string>();
	const items = rows.map((row): DiaryTimelineItem => {
		if (row.runId) runIds.add(row.runId);
		return {
			completedAt: row.completedAt,
			detail: row.errorMessage,
			durationMs: row.durationMs,
			id: row.id,
			kind: 'skill',
			mode: null,
			projectName: row.projectName,
			projectPath: row.projectPath,
			startedAt: row.startedAt,
			status: row.status,
			title: row.resourceName,
		};
	});
	return { items, runIds };
}

async function queryRecipeSessions(
	ctx: TimelineContext,
	options: ListTimelineOptions,
	limit: number
): Promise<DiaryTimelineItem[]> {
	const where = combine(
		// `skill:%` sessions are the one-shot wrapper around a skill invocation, already
		// represented by their invocation_events row — exclude them so they are not double-counted.
		not(like(pipelineSessions.recipeId, 'skill:%')),
		options.projectPath
			? projectPathFilterFor(pipelineSessions.projectPath, options.projectPath)
			: undefined,
		cursorFilterFor(pipelineSessions.startedAt, pipelineSessions.id, options.cursor)
	);
	const rows = await ctx.db
		.select()
		.from(pipelineSessions)
		.where(where)
		.orderBy(desc(pipelineSessions.startedAt), desc(pipelineSessions.id))
		.limit(limit);
	return rows.map((row) => ({
		completedAt: row.completedAt,
		detail: row.errorMessage,
		durationMs: row.durationMs,
		id: row.id,
		kind: 'recipe-session',
		mode: null,
		projectName: row.projectName,
		projectPath: row.projectPath,
		startedAt: row.startedAt,
		status: row.status,
		title: row.recipeName,
	}));
}

async function queryDirectorCycles(
	ctx: TimelineContext,
	options: ListTimelineOptions,
	limit: number
): Promise<DiaryTimelineItem[]> {
	const where = cursorFilterFor(directorCycles.startedAt, directorCycles.id, options.cursor);
	const rows = await ctx.db
		.select()
		.from(directorCycles)
		.where(where)
		.orderBy(desc(directorCycles.startedAt), desc(directorCycles.id))
		.limit(limit);
	return rows.map((row) => ({
		completedAt: row.completedAt,
		detail:
			row.failureReason ??
			(row.totalSuggestions > 0 ? `${row.totalSuggestions} suggestions` : null),
		durationMs: row.completedAt ? row.completedAt - row.startedAt : null,
		id: row.id,
		kind: 'director-cycle',
		mode: null,
		projectName: null,
		projectPath: null,
		startedAt: row.startedAt,
		status: row.status,
		title: 'Director cycle',
	}));
}

async function readReleases(rootDir: string): Promise<DiaryTimelineItem[]> {
	let text: string;
	try {
		text = await readFile(join(rootDir, '.aidd', 'CHANGELOG.md'), 'utf8');
	} catch {
		return [];
	}
	const items: DiaryTimelineItem[] = [];
	for (const line of text.split(/\r?\n/)) {
		const match = RELEASE_HEADING.exec(line);
		if (!match?.[1] || !match[2]) continue;
		const startedAt = Date.parse(`${match[1]}T00:00:00`);
		if (Number.isNaN(startedAt)) continue;
		items.push({
			completedAt: null,
			detail: null,
			durationMs: null,
			id: `release:${match[1]}:${items.length}`,
			kind: 'release',
			mode: null,
			projectName: 'aidd',
			projectPath: null,
			startedAt,
			status: 'completed',
			title: match[2].trim(),
		});
		if (items.length >= MAX_RELEASES) break;
	}
	return items;
}

function sortDescending(items: DiaryTimelineItem[]): DiaryTimelineItem[] {
	return [...items].sort((left, right) => {
		if (right.startedAt !== left.startedAt) return right.startedAt - left.startedAt;
		return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
	});
}

export async function listTimelinePage(
	ctx: TimelineContext,
	options: ListTimelineOptions = {}
): Promise<CursorPage<DiaryTimelineItem>> {
	const limit = clampLimit(options.limit);
	const isFirstPage = options.cursor === undefined || options.cursor === '';
	const isGlobal = !options.projectPath;
	// Over-fetch one extra per source so a full page can be assembled even after cross-source merge
	// and run/skill de-duplication.
	const probe = limit + 1;

	const [runItems, skills, recipeSessions, cycles] = await Promise.all([
		queryRuns(ctx, options, probe),
		querySkills(ctx, options, probe),
		queryRecipeSessions(ctx, options, probe),
		isGlobal ? queryDirectorCycles(ctx, options, probe) : Promise.resolve([]),
	]);

	// Drop the run row a web-launched skill produced; its invocation row carries the richer
	// label and is already in the feed.
	const dedupedRuns = runItems.filter((item) => !skills.runIds.has(item.id));
	const dbItems = sortDescending([...dedupedRuns, ...skills.items, ...recipeSessions, ...cycles]);

	const hasNext = dbItems.length > limit;
	const page = dbItems.slice(0, limit);
	const lastDbItem = page[page.length - 1];
	const nextCursor =
		hasNext && lastDbItem
			? encodeCursor({ id: lastDbItem.id, startedAt: lastDbItem.startedAt })
			: null;

	// Releases are filesystem-scanned, display-only first-page extras (like CLI heartbeat rows on
	// the Runs page) and never key the cursor.
	const releases = isGlobal && isFirstPage ? await readReleases(ctx.rootDir) : [];
	const items = releases.length > 0 ? sortDescending([...page, ...releases]) : page;

	return { items, nextCursor };
}
