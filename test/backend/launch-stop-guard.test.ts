import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { guardPendingProjectStop } from '../../backend/src/services/run/launchStopGuard.ts';
import {
	createCliActiveRunRecord,
	writeCliActiveRunRecord,
} from '../../shared/src/metadata/active-runs.ts';
import { stopFilePath } from '../../shared/src/metadata/paths.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

// `aidd --stop` on a run started straight from the CLI writes the project-wide stop file. That run
// has no row in the web's runs table until it ends, so a launch from the panel used to find "no
// live sibling", delete the file, and leave the CLI run with nothing able to stop it.

async function project(): Promise<string> {
	const dir = await testTempDir('aidd-launch-stop-guard-');
	const stop = stopFilePath(dir);
	await mkdir(dirname(stop), { recursive: true });
	await writeFile(stop, `${new Date().toISOString()}\n`);
	return dir;
}

function database() {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	return { sqlite, ...wrapWebDatabase(sqlite) };
}

describe('guardPendingProjectStop', () => {
	test('refuses a launch while a direct-CLI run the stop may be meant for is live', async () => {
		const dir = await project();
		const { db, sqlite } = database();
		try {
			await writeCliActiveRunRecord({
				...createCliActiveRunRecord({
					backend: 'codex',
					id: 'run_cli_direct',
					mode: 'coding',
					model: undefined,
					projectDir: dir,
					provider: undefined,
					reasoningEffort: 'low',
				}),
				state: 'running',
			});

			await expect(guardPendingProjectStop(db, dir)).rejects.toThrow(
				'A stop is pending for run run_cli_direct',
			);
			expect(existsSync(stopFilePath(dir))).toBe(true);
		} finally {
			sqlite.close();
			await removeTempTree(dir);
		}
	});

	test('clears a stop file no live run can consume', async () => {
		const dir = await project();
		const { db, sqlite } = database();
		try {
			await guardPendingProjectStop(db, dir);
			expect(existsSync(stopFilePath(dir))).toBe(false);
		} finally {
			sqlite.close();
			await removeTempTree(dir);
		}
	});
});
