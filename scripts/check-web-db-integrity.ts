#!/usr/bin/env bun
import { Database } from 'bun:sqlite';
import { stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { formatForeignKeyViolation, getForeignKeyViolations } from '../backend/src/db/integrity.ts';
import { migrateWebDatabase } from '../backend/src/db/migrate.ts';
import { applyConnectionPragmas } from '../backend/src/db/pragmas.ts';

const repoRoot = resolve(import.meta.dir, '..');
const dbPath = join(repoRoot, 'data', 'aidd-panel.db');

async function fileExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch (err) {
		if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
			return false;
		}
		throw err;
	}
}

async function main(): Promise<void> {
	if (!(await fileExists(dbPath))) {
		console.log('Web database integrity check skipped: data/aidd-panel.db does not exist.');
		return;
	}

	const sqlite = new Database(dbPath);
	try {
		applyConnectionPragmas(sqlite);
		migrateWebDatabase(sqlite);

		const violations = getForeignKeyViolations(sqlite);
		if (violations.length > 0) {
			console.error(`Web database foreign key violations detected: ${violations.length}`);
			for (const violation of violations.slice(0, 20)) {
				console.error(`  ${formatForeignKeyViolation(violation)}`);
			}
			if (violations.length > 20) {
				console.error(`  ${violations.length - 20} additional violation(s) omitted.`);
			}
			process.exit(1);
		}

		console.log('Web database integrity check passed.');
	} finally {
		sqlite.close();
	}
}

await main();
