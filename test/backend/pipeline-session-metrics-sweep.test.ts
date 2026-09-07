import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { pipelineSessions } from '../../backend/src/db/schema.ts';
import { sweepSessionMetrics } from '../../backend/src/services/pipeline/sessionMetricsSweep.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

function makeDb(): { db: ReturnType<typeof wrapWebDatabase>['db']; sqlite: Database } {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	migrateWebDatabase(sqlite);
	return { db: wrapWebDatabase(sqlite).db, sqlite };
}

async function insertSession(
	db: ReturnType<typeof makeDb>['db'],
	id: string,
	projectPath: string,
	status: string,
): Promise<void> {
	await db.insert(pipelineSessions).values({
		id,
		parametersJson: '{}',
		projectName: 'proj',
		projectPath,
		recipeId: 'r',
		recipeName: 'R',
		startedAt: 1,
		status,
		totalSteps: 1,
	});
}

function metricsDir(projectDir: string, sessionId: string): string {
	return join(projectDir, '.aidd', 'runtime', 'pipeline-sessions', sessionId);
}

async function writeMetrics(projectDir: string, sessionId: string): Promise<void> {
	const dir = metricsDir(projectDir, sessionId);
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, 'metrics.json'), '{}', 'utf8');
}

async function exists(path: string): Promise<boolean> {
	return await Bun.file(path).exists();
}

describe('pipeline session-metrics sweep', () => {
	test('removes metrics for terminal sessions and keeps active ones', async () => {
		const projectDir = await testTempDir('aidd-metrics-sweep-');
		try {
			const { db, sqlite } = makeDb();
			try {
				await insertSession(db, 'pipe_done', projectDir, 'completed');
				await insertSession(db, 'pipe_live', projectDir, 'running');
				await writeMetrics(projectDir, 'pipe_done');
				await writeMetrics(projectDir, 'pipe_live');
				// No row at all: a session that died before its insert, or whose row was
				// pruned. A row-driven delete would strand this forever.
				await writeMetrics(projectDir, 'pipe_orphan');

				expect(await sweepSessionMetrics(db)).toBe(2);

				expect(
					await exists(join(metricsDir(projectDir, 'pipe_done'), 'metrics.json')),
				).toBe(false);
				expect(
					await exists(join(metricsDir(projectDir, 'pipe_orphan'), 'metrics.json')),
				).toBe(false);
				expect(
					await exists(join(metricsDir(projectDir, 'pipe_live'), 'metrics.json')),
				).toBe(true);

				// Idempotent: a second boot finds nothing left to collect.
				expect(await sweepSessionMetrics(db)).toBe(0);
			} finally {
				sqlite.close();
			}
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('collects reports/session-*.json metrics files without touching deliverables', async () => {
		const projectDir = await testTempDir('aidd-metrics-reports-');
		try {
			const { db, sqlite } = makeDb();
			try {
				await insertSession(db, 'pipe_old', projectDir, 'completed');
				await insertSession(db, 'pipe_live', projectDir, 'running');
				const reportsDir = join(projectDir, '.aidd', 'reports');
				await mkdir(reportsDir, { recursive: true });
				await writeFile(join(reportsDir, 'session-pipe_old.json'), '{}', 'utf8');
				await writeFile(join(reportsDir, 'session-pipe_live.json'), '{}', 'utf8');
				await writeFile(join(reportsDir, 'first-session.md'), '# report', 'utf8');
				await writeFile(join(reportsDir, 'feature-coverage-audit.md'), '# audit', 'utf8');

				expect(await sweepSessionMetrics(db)).toBe(1);

				// Deliverables in reports/ are the reason this sweep is scoped to the exact
				// session-<id>.json shape instead of pruning the directory.
				expect([...(await readdir(reportsDir))].sort()).toEqual([
					'feature-coverage-audit.md',
					'first-session.md',
					'session-pipe_live.json',
				]);
			} finally {
				sqlite.close();
			}
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('leaves projects with no sessions alone', async () => {
		const { db, sqlite } = makeDb();
		try {
			expect(await sweepSessionMetrics(db)).toBe(0);
		} finally {
			sqlite.close();
		}
	});
});
