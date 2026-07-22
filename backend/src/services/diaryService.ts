import { and, desc, eq, lt, or, sql, type SQL } from 'drizzle-orm';

import type { WebDatabase } from '../db/client.ts';
import type { DbCommands } from '../db/commands.ts';
import type { DiaryEntryUpsert } from '../db/commands/types.ts';
import type { ProjectService } from './projectService.ts';

import { diaryEntries } from '../db/schema.ts';
import { encodeProjectId } from '../paths.ts';
import { recordDataMovement } from './dataMovementTrace.ts';
import { scanProjectDiary } from './diary/scan.ts';
import {
	type DiaryTimelineItem,
	listTimelinePage,
	type ListTimelineOptions,
} from './diary/timeline.ts';
import { clampLimit, type CursorPage, decodeCursor, encodeCursor } from './pagination.ts';

// How long a project's (or the whole fleet's) on-disk diary is trusted after a reconcile before
// the next read re-scans it. Bounds the filesystem cost of reconcile-on-read; new entries still
// appear within this window, and the per-file content-hash short-circuit keeps an in-window
// re-scan cheap when it does run.
const RECONCILE_TTL_MS = 15_000;

export interface DiaryEntryDto {
	bodyMd: string;
	date: string;
	generatedBy: null | string;
	id: string;
	phase: null | string;
	projectId: string;
	projectName: string;
	projectPath: string;
	summary: null | string;
	title: string;
}

const EMPTY_PAGE: CursorPage<never> = { items: [], nextCursor: null };

export interface ListDiaryEntriesOptions {
	cursor?: string;
	limit?: number;
	projectPath?: string;
}

// SQL mirror of normalizeComparablePath(): fold '/'→'\' and compare case-insensitively on win32,
// matching the entry-id fold so a project's rows match regardless of slash/casing.
function projectPathFilter(projectPath: string): SQL {
	const normalizedColumn = sql`replace(${diaryEntries.projectPath}, '/', '\\')`;
	const target = projectPath.replaceAll('/', '\\');
	return process.platform === 'win32'
		? sql`lower(${normalizedColumn}) = ${target.toLowerCase()}`
		: sql`${normalizedColumn} = ${target}`;
}

function msToDate(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

function projectNameFromPath(projectPath: string): string {
	return (
		projectPath
			.replace(/[/\\]+$/, '')
			.split(/[/\\]/)
			.pop() ?? projectPath
	);
}

export class DiaryService {
	private readonly commands: DbCommands;
	private readonly db: WebDatabase;
	private readonly projectService: ProjectService;
	private readonly rootDir: string;
	private readonly projectReconciledAt = new Map<string, number>();
	private allReconciledAt = 0;

	constructor(input: {
		commands: DbCommands;
		db: WebDatabase;
		projectService: ProjectService;
		rootDir: string;
	}) {
		this.commands = input.commands;
		this.db = input.db;
		this.projectService = input.projectService;
		this.rootDir = input.rootDir;
	}

	async listEntriesPage(
		options: ListDiaryEntriesOptions = {}
	): Promise<CursorPage<DiaryEntryDto>> {
		let filterPath: string | undefined;
		if (options.projectPath) {
			// Resolve through allowed roots before any filesystem read, and key the query off the
			// resolved canonical path so it matches the rows reconcile stored. An unknown/disallowed
			// path yields an empty page — never a global listing and never an arbitrary-path scan.
			const resolved = await this.resolveProject(options.projectPath);
			if (!resolved) return EMPTY_PAGE;
			await this.reconcileProject(resolved);
			filterPath = resolved;
		} else {
			await this.reconcileAll();
		}

		const limit = clampLimit(options.limit);
		const where = this.entriesWhere(options.cursor, filterPath);
		const rows = await this.db
			.select()
			.from(diaryEntries)
			.where(where)
			.orderBy(desc(diaryEntries.entryDate), desc(diaryEntries.id))
			.limit(limit + 1);
		const hasNext = rows.length > limit;
		const page = rows.slice(0, limit);
		const last = page[page.length - 1];
		const nextCursor =
			hasNext && last
				? encodeCursor({
						id: last.id,
						startedAt: Date.parse(`${last.entryDate}T00:00:00Z`),
					})
				: null;
		return {
			items: page.map((row) => ({
				bodyMd: row.bodyMd,
				date: row.entryDate,
				generatedBy: row.generatedBy,
				id: row.id,
				phase: row.phase,
				projectId: encodeProjectId(row.projectPath),
				projectName: row.projectName,
				projectPath: row.projectPath,
				summary: row.summary,
				title: row.title,
			})),
			nextCursor,
		};
	}

	async listTimelinePage(
		options: ListTimelineOptions = {}
	): Promise<CursorPage<DiaryTimelineItem>> {
		// The timeline is read-only SQL, but resolving the path keeps scoping correct (canonical
		// match) and consistent with the entries endpoint: an unknown/disallowed path is empty.
		if (options.projectPath) {
			const resolved = await this.resolveProject(options.projectPath);
			if (!resolved) return EMPTY_PAGE;
			return listTimelinePage(
				{ db: this.db, rootDir: this.rootDir },
				{ ...options, projectPath: resolved }
			);
		}
		return listTimelinePage({ db: this.db, rootDir: this.rootDir }, options);
	}

	// Validate an incoming project path against the configured allowed roots, returning the
	// resolved canonical path or null when it is not an allowed, existing project. The single
	// guard every filesystem- or scope-sensitive diary read funnels through.
	private async resolveProject(projectPath: string): Promise<null | string> {
		try {
			return await this.projectService.resolveProjectPath(projectPath);
		} catch {
			return null;
		}
	}

	private entriesWhere(
		cursor: string | undefined,
		projectPath: string | undefined
	): SQL | undefined {
		const filters: SQL[] = [];
		if (projectPath) filters.push(projectPathFilter(projectPath));
		const decoded = decodeCursor(cursor);
		if (decoded) {
			const cursorDate = msToDate(decoded.startedAt);
			filters.push(
				or(
					lt(diaryEntries.entryDate, cursorDate),
					and(eq(diaryEntries.entryDate, cursorDate), lt(diaryEntries.id, decoded.id))
				) as SQL
			);
		}
		if (filters.length === 0) return undefined;
		if (filters.length === 1) return filters[0];
		return and(...filters);
	}

	private async reconcileProject(projectPath: string): Promise<void> {
		const key = projectPath.replaceAll('/', '\\').toLowerCase();
		if (Date.now() - (this.projectReconciledAt.get(key) ?? 0) < RECONCILE_TTL_MS) return;
		this.projectReconciledAt.set(key, Date.now());
		await this.reconcileOne(projectPath, projectNameFromPath(projectPath));
	}

	private async reconcileAll(): Promise<void> {
		if (Date.now() - this.allReconciledAt < RECONCILE_TTL_MS) return;
		this.allReconciledAt = Date.now();
		const { projects } = await this.projectService.listProjectListings();
		for (const project of projects) {
			const key = project.summary.path.replaceAll('/', '\\').toLowerCase();
			this.projectReconciledAt.set(key, Date.now());
			await this.reconcileOne(project.summary.path, project.summary.name);
		}
	}

	private async reconcileOne(projectPath: string, projectName: string): Promise<void> {
		const { entries } = await scanProjectDiary(projectPath, projectName);
		const upserts: DiaryEntryUpsert[] = entries.map((entry) => ({
			bodyMd: entry.bodyMd,
			contentHash: entry.contentHash,
			entryDate: entry.entryDate,
			fileMtimeMs: entry.fileMtimeMs,
			filePath: entry.filePath,
			generatedBy: entry.generatedBy,
			id: entry.id,
			phase: entry.phase,
			projectName: entry.projectName,
			projectPath: entry.projectPath,
			summary: entry.summary,
			title: entry.title,
		}));
		const result = await this.commands.reconcileDiaryEntries({
			entries: upserts,
			now: Date.now(),
			projectPath,
		});
		if (result.deleted > 0 || result.upserted > 0) {
			recordDataMovement({
				category: 'database',
				operation: 'diary.reconcile',
				status: 'success',
				summary: { deleted: result.deleted, projectPath, upserted: result.upserted },
				target: 'diary_entries',
			});
		}
	}
}
