import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Index of per-project diary entries. The markdown files under each project's
// `.aidd/diary/YYYY/MM/DD.md` are the source of truth; rows here are a reconciled
// projection so the web UI can query entries without touching project filesystems.
//
// project_path and project_name are intentionally denormalized (no projects table to
// anchor a foreign key — see assertion DATA-007 in runsTables.ts). body_md stores the
// full entry so reads never re-open files; reconcile overwrites the row when the file's
// content_hash changes and deletes rows whose file disappeared.
export const diaryEntries = sqliteTable(
	'diary_entries',
	{
		bodyMd: text('body_md').notNull(),
		contentHash: text('content_hash').notNull(),
		entryDate: text('entry_date').notNull(),
		fileMtimeMs: integer('file_mtime_ms').notNull(),
		filePath: text('file_path').notNull(),
		generatedBy: text('generated_by'),
		id: text('id').primaryKey(),
		indexedAt: integer('indexed_at').notNull(),
		phase: text('phase'),
		projectName: text('project_name').notNull(),
		// Canonical spelling, from the project resolution in services/project/lifecycle.ts.
		projectPath: text('project_path').notNull(),
		summary: text('summary'),
		title: text('title').notNull(),
	},
	(table) => [
		uniqueIndex('idx_diary_entries_project_date').on(table.projectPath, table.entryDate),
		index('idx_diary_entries_entry_date').on(table.entryDate),
		check(
			'ck_diary_entries_phase',
			sql`${table.phase} IS NULL OR ${table.phase} IN ('Architecture','Backend','Bugfix','Collector','DevOps','Frontend','Research','Template','Tooling')`,
		),
	],
);
