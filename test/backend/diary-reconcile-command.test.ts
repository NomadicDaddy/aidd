import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';

import type { DbCommands } from '../../backend/src/db/commands.ts';
import type { DiaryEntryUpsert } from '../../backend/src/db/commands/types.ts';

import { wrapWebDatabase, type WebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { diaryEntries } from '../../backend/src/db/schema.ts';
import { diaryEntryId } from '../../backend/src/services/diary/parse.ts';

const PROJECT = 'd:/applications/demo';

let db: WebDatabase;
let commands: DbCommands;

beforeEach(() => {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	const wrapped = wrapWebDatabase(sqlite);
	db = wrapped.db;
	commands = wrapped.commands;
});

function entry(
	date: string,
	hash: string,
	overrides: Partial<DiaryEntryUpsert> = {}
): DiaryEntryUpsert {
	return {
		bodyMd: `# ${date}`,
		contentHash: hash,
		entryDate: date,
		fileMtimeMs: 1,
		filePath: `${PROJECT}/.aidd/diary/${date.replaceAll('-', '/')}.md`,
		generatedBy: null,
		id: diaryEntryId(PROJECT, date),
		phase: null,
		projectName: 'demo',
		projectPath: PROJECT,
		summary: null,
		title: date,
		...overrides,
	};
}

async function countRows(): Promise<number> {
	return (await db.select().from(diaryEntries)).length;
}

describe('reconcileDiaryEntries', () => {
	test('inserts new entries', async () => {
		const result = await commands.reconcileDiaryEntries({
			entries: [entry('2026-06-11', 'h1'), entry('2026-06-12', 'h2')],
			now: 1000,
			projectPath: PROJECT,
		});
		expect(result.upserted).toBe(2);
		expect(result.deleted).toBe(0);
		expect(await countRows()).toBe(2);
	});

	test('is a no-op when content hashes are unchanged', async () => {
		const args = {
			entries: [entry('2026-06-12', 'same')],
			now: 1000,
			projectPath: PROJECT,
		};
		await commands.reconcileDiaryEntries(args);
		const second = await commands.reconcileDiaryEntries({ ...args, now: 2000 });
		expect(second).toEqual({ deleted: 0, unchanged: 1, upserted: 0 });
	});

	test('updates a row when its content hash changes', async () => {
		await commands.reconcileDiaryEntries({
			entries: [entry('2026-06-12', 'old', { title: 'Old' })],
			now: 1000,
			projectPath: PROJECT,
		});
		const result = await commands.reconcileDiaryEntries({
			entries: [entry('2026-06-12', 'new', { title: 'New' })],
			now: 2000,
			projectPath: PROJECT,
		});
		expect(result.upserted).toBe(1);
		const rows = await db.select().from(diaryEntries);
		expect(rows[0]?.title).toBe('New');
		expect(await countRows()).toBe(1);
	});

	test('deletes rows whose file disappeared', async () => {
		await commands.reconcileDiaryEntries({
			entries: [entry('2026-06-11', 'h1'), entry('2026-06-12', 'h2')],
			now: 1000,
			projectPath: PROJECT,
		});
		const result = await commands.reconcileDiaryEntries({
			entries: [entry('2026-06-12', 'h2')],
			now: 2000,
			projectPath: PROJECT,
		});
		expect(result.deleted).toBe(1);
		expect(await countRows()).toBe(1);
	});

	test('running twice with the same input is idempotent', async () => {
		const args = {
			entries: [entry('2026-06-11', 'h1'), entry('2026-06-12', 'h2')],
			now: 1000,
			projectPath: PROJECT,
		};
		await commands.reconcileDiaryEntries(args);
		const second = await commands.reconcileDiaryEntries({ ...args, now: 2000 });
		expect(second).toEqual({ deleted: 0, unchanged: 2, upserted: 0 });
		expect(await countRows()).toBe(2);
	});

	test('matches existing rows regardless of path slash/casing variant', async () => {
		await commands.reconcileDiaryEntries({
			entries: [entry('2026-06-12', 'h2')],
			now: 1000,
			projectPath: PROJECT,
		});
		// Same project, different slash + case: the existing row must be found (unchanged), not
		// duplicated.
		const result = await commands.reconcileDiaryEntries({
			entries: [entry('2026-06-12', 'h2')],
			now: 2000,
			projectPath: 'D:\\applications\\Demo',
		});
		expect(result.unchanged).toBe(1);
		expect(await countRows()).toBe(1);
	});
});
