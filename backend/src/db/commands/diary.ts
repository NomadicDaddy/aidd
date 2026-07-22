import { eq, inArray, sql } from 'drizzle-orm';

import type { LocalTransaction, ReconcileDiaryEntriesArgs } from './types.ts';

import { diaryEntries } from '../schema.ts';

// Reconcile the diary_entries index for one project to exactly the set of entries scanned from
// its `.aidd/diary/` directory. Idempotent: rows whose content_hash is unchanged are left
// untouched, changed/new rows are inserted-or-replaced, and rows whose file disappeared are
// deleted. The markdown files are the source of truth; this only mirrors them into SQL.
//
// The whole read-modify-write runs inside one transaction on the owning connection (the DB
// worker in production, the in-memory db in tests) — never via the async sqlite-proxy, which
// cannot hold a BEGIN…COMMIT across round-trips.
export function reconcileDiaryEntries(
	tx: LocalTransaction,
	args: ReconcileDiaryEntriesArgs
): { deleted: number; unchanged: number; upserted: number } {
	const { entries, projectPath } = args;
	// Match the win32 '/'→'\' + lowercase fold used to build entry ids, so a project's rows are
	// found regardless of the slash/casing variant the caller passes.
	const folded = projectPath.replaceAll('/', '\\').toLowerCase();
	const existing = tx
		.select({ contentHash: diaryEntries.contentHash, id: diaryEntries.id })
		.from(diaryEntries)
		.where(sql`lower(replace(${diaryEntries.projectPath}, '/', '\\')) = ${folded}`)
		.all();
	const existingHashById = new Map(existing.map((row) => [row.id, row.contentHash]));
	const keepIds = new Set(entries.map((entry) => entry.id));

	const staleIds = existing.map((row) => row.id).filter((id) => !keepIds.has(id));
	let deleted = 0;
	if (staleIds.length > 0) {
		tx.delete(diaryEntries).where(inArray(diaryEntries.id, staleIds)).run();
		deleted = staleIds.length;
	}

	let unchanged = 0;
	let upserted = 0;
	for (const entry of entries) {
		if (existingHashById.get(entry.id) === entry.contentHash) {
			unchanged++;
			continue;
		}
		tx.delete(diaryEntries).where(eq(diaryEntries.id, entry.id)).run();
		tx.insert(diaryEntries)
			.values({
				bodyMd: entry.bodyMd,
				contentHash: entry.contentHash,
				entryDate: entry.entryDate,
				fileMtimeMs: entry.fileMtimeMs,
				filePath: entry.filePath,
				generatedBy: entry.generatedBy,
				id: entry.id,
				indexedAt: args.now,
				phase: entry.phase,
				projectName: entry.projectName,
				projectPath: entry.projectPath,
				summary: entry.summary,
				title: entry.title,
			})
			.run();
		upserted++;
	}

	return { deleted, unchanged, upserted };
}
