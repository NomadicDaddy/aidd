import {
	EXECUTION_HISTORY_MAX_AGE_MS,
	TRANSCRIPT_MAX_AGE_MS,
	TRANSCRIPT_MAX_BYTES,
} from 'aidd-shared/retention';

import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, truncate, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { sweepRetention } from '../../backend/src/services/retention/cleanup.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

const roots: string[] = [];

async function fixture() {
	const root = await testTempDir('aidd-retention-');
	roots.push(root);
	const dataDir = join(root, 'data');
	await mkdir(join(dataDir, 'run-logs'), { recursive: true });
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	const { db } = wrapWebDatabase(sqlite);
	return { dataDir, db, sqlite };
}

function insertRun(
	sqlite: Database,
	input: {
		completedAt: null | number;
		id: string;
		logPath: null | string;
		startedAt: number;
		status: 'completed' | 'running';
	},
): void {
	sqlite
		.query(
			'INSERT INTO runs (id, project_path, project_name, backend, mode, status, log_path, started_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
		)
		.run(
			input.id,
			'D:/applications/test',
			'test',
			'native',
			'coding',
			input.status,
			input.logPath,
			input.startedAt,
			input.completedAt,
		);
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => removeTempTree(root)));
});

describe('local execution retention', () => {
	test('applies the age boundary, preserves active logs, and clears removed references', async () => {
		const { dataDir, db, sqlite } = await fixture();
		const now = Date.UTC(2026, 8, 10);
		const expired = join(dataDir, 'run-logs', 'expired.log');
		const boundary = join(dataDir, 'run-logs', 'boundary.log');
		const active = join(dataDir, 'run-logs', 'active.log');
		await Promise.all([
			writeFile(expired, 'expired'),
			writeFile(boundary, 'boundary'),
			writeFile(active, 'active'),
		]);
		insertRun(sqlite, {
			completedAt: now - TRANSCRIPT_MAX_AGE_MS - 1,
			id: 'expired',
			logPath: expired,
			startedAt: now - TRANSCRIPT_MAX_AGE_MS - 1,
			status: 'completed',
		});
		insertRun(sqlite, {
			completedAt: now - TRANSCRIPT_MAX_AGE_MS,
			id: 'boundary',
			logPath: boundary,
			startedAt: now - TRANSCRIPT_MAX_AGE_MS,
			status: 'completed',
		});
		insertRun(sqlite, {
			completedAt: null,
			id: 'active',
			logPath: active,
			startedAt: now - TRANSCRIPT_MAX_AGE_MS - 1,
			status: 'running',
		});

		const first = await sweepRetention(db, dataDir, now);
		expect(first.transcripts.removed).toBe(1);
		expect(existsSync(expired)).toBe(false);
		expect(existsSync(boundary)).toBe(true);
		expect(existsSync(active)).toBe(true);
		expect(sqlite.query('SELECT log_path FROM runs WHERE id = ?').get('expired')).toEqual({
			log_path: null,
		});
		expect((await sweepRetention(db, dataDir, now)).transcripts.removed).toBe(0);
		sqlite.close();
	});

	test('evicts the oldest terminal transcript until the byte cap is satisfied', async () => {
		const { dataDir, db, sqlite } = await fixture();
		const now = Date.UTC(2026, 8, 10);
		const old = join(dataDir, 'run-logs', 'old.log');
		const newer = join(dataDir, 'run-logs', 'newer.log');
		await Promise.all([writeFile(old, ''), writeFile(newer, '')]);
		const each = Math.floor(TRANSCRIPT_MAX_BYTES * 0.6);
		await Promise.all([truncate(old, each), truncate(newer, each)]);
		insertRun(sqlite, {
			completedAt: now - 2_000,
			id: 'old',
			logPath: old,
			startedAt: now - 3_000,
			status: 'completed',
		});
		insertRun(sqlite, {
			completedAt: now - 1_000,
			id: 'newer',
			logPath: newer,
			startedAt: now - 2_000,
			status: 'completed',
		});

		const result = await sweepRetention(db, dataDir, now);
		expect(result.transcripts.removed).toBe(1);
		expect(result.transcripts.bytes).toBeLessThanOrEqual(TRANSCRIPT_MAX_BYTES);
		expect(existsSync(old)).toBe(false);
		expect(existsSync(newer)).toBe(true);
		sqlite.close();
	});

	test('prunes only expired terminal execution history in foreign-key-safe order', async () => {
		const { dataDir, db, sqlite } = await fixture();
		const now = Date.UTC(2026, 8, 10);
		const old = now - EXECUTION_HISTORY_MAX_AGE_MS - 1;
		sqlite
			.query(
				"INSERT INTO pipeline_sessions (id, project_name, project_path, recipe_id, recipe_name, parameters_json, started_at, completed_at, status, total_steps) VALUES ('old-session', 'test', 'D:/applications/test', 'recipe', 'Recipe', '{}', ?, ?, 'completed', 0)",
			)
			.run(old, old);
		insertRun(sqlite, {
			completedAt: old,
			id: 'old-run',
			logPath: null,
			startedAt: old,
			status: 'completed',
		});
		sqlite
			.query(
				"INSERT INTO invocation_events (id, project_name, project_path, resource_id, resource_name, resource_type, source, status, started_at, completed_at, run_id, session_id) VALUES ('old-invocation', 'test', 'D:/applications/test', 'skill', 'Skill', 'skill', 'web', 'completed', ?, ?, 'old-run', 'old-session')",
			)
			.run(old, old);
		insertRun(sqlite, {
			completedAt: null,
			id: 'active-run',
			logPath: null,
			startedAt: old,
			status: 'running',
		});

		const result = await sweepRetention(db, dataDir, now);
		expect(result.history).toEqual({ invocations: 1, pipelineSessions: 1, runs: 1 });
		expect(sqlite.query('SELECT id FROM runs').all()).toEqual([{ id: 'active-run' }]);
		expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
		sqlite.close();
	});
});
