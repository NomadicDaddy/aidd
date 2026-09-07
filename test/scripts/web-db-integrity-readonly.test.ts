import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runWebDbIntegrity } from '../../scripts/check-web-db-integrity.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../backend/_helpers/remove-temp-tree.ts';

test('integrity gate inspects an unmigrated database without writing or acquiring its writer role', async () => {
	const directory = await testTempDir('aidd-integrity-readonly-');
	const path = join(directory, 'database.db');
	try {
		const sqlite = new Database(path);
		sqlite.exec(
			'CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(parent_id INTEGER REFERENCES parent(id)); INSERT INTO child VALUES (7);',
		);
		sqlite.close();
		await writeFile(`${path}.lock`, JSON.stringify({ pid: process.pid }));
		const before = await readFile(path);
		expect(await runWebDbIntegrity(path)).toBe(1);
		expect(await readFile(path)).toEqual(before);
		const inspection = new Database(path, { readonly: true });
		try {
			expect(
				inspection
					.query("SELECT name FROM sqlite_master WHERE name = 'schema_migrations'")
					.all(),
			).toEqual([]);
		} finally {
			inspection.close();
		}
	} finally {
		await removeTempTree(directory);
	}
});
