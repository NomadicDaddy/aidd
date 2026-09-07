#!/usr/bin/env bun
/**
 * Foreign-key integrity check for the web control-panel database.
 *
 * Enforces: DATA-007 -- run and pipeline rows hold denormalized project fields against discovered
 * projects, so the references those rows do carry must all resolve.
 */
import { Database } from 'bun:sqlite';
import { stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { exit } from 'node:process';

import { formatForeignKeyViolation, getForeignKeyViolations } from '../backend/src/db/integrity.ts';

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

export async function runWebDbIntegrity(databasePath: string = dbPath): Promise<number> {
	if (!(await fileExists(databasePath))) {
		console.log('[SKIP] Web database integrity check: data/aidd-panel.db does not exist.');
		return 0;
	}

	// The panel may hold the writer lock. Inspection must never migrate or modify its database.
	const sqlite = new Database(databasePath, { readonly: true });
	try {
		const violations = getForeignKeyViolations(sqlite);
		if (violations.length > 0) {
			console.error(
				`[FAIL] Web database foreign key violations detected: ${violations.length}`,
			);
			for (const violation of violations.slice(0, 20)) {
				console.error(`  ${formatForeignKeyViolation(violation)}`);
			}
			if (violations.length > 20) {
				console.error(`  ${violations.length - 20} additional violation(s) omitted.`);
			}
			return 1;
		}

		console.log('[OK] Web database integrity check passed.');
		return 0;
	} finally {
		sqlite.close();
	}
}

if (import.meta.main) exit(await runWebDbIntegrity());
