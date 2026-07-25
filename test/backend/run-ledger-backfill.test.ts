import { Database } from 'bun:sqlite';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { runs } from '../../backend/src/db/schema.ts';
import { reconcileRunLedgerDrift } from '../../backend/src/services/run/ledgerBackfillSweep.ts';
import { eq } from 'drizzle-orm';

import { testTempDir } from '../_helpers/temp.ts';
function makeDb() {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	migrateWebDatabase(sqlite);
	return { sqlite, ...wrapWebDatabase(sqlite) };
}

async function seedRun(
	db: ReturnType<typeof makeDb>['db'],
	input: {
		exitCode?: null | number;
		id: string;
		projectPath: string;
		startedAt?: number;
		status: string;
		stopReason?: null | string;
		summary?: null | string;
	},
): Promise<void> {
	await db.insert(runs).values({
		backend: 'native',
		exitCode: input.exitCode ?? null,
		id: input.id,
		mode: 'coding',
		projectName: 'proj',
		projectPath: input.projectPath,
		source: 'web',
		startedAt: input.startedAt ?? Date.now(),
		status: input.status,
		stopReason: input.stopReason ?? null,
		summary: input.summary ?? null,
	});
}

async function writeLedgerLine(projectDir: string, entries: Record<string, unknown>[]) {
	const metadataDir = join(projectDir, '.aidd');
	await mkdir(metadataDir, { recursive: true });
	await writeFile(
		join(metadataDir, 'runs.jsonl'),
		`${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
	);
}

describe('reconcileRunLedgerDrift', () => {
	test('fills NULL terminal fields from the ledger, never overwriting non-null values', async () => {
		const projectDir = await testTempDir('aidd-backfill-');
		const { db, sqlite } = makeDb();
		try {
			await writeLedgerLine(projectDir, [
				{
					durationMs: 4321,
					exitCode: 130,
					runId: 'run-null-fields',
					stopReason: 'stop_requested',
					summary: 'stopped by user; full ledger facts',
				},
				{
					exitCode: 99,
					runId: 'run-has-values',
					stopReason: 'exit_error',
					summary: 'ledger says exit_error',
				},
				{ exitCode: 1, runId: 'run-still-running', stopReason: 'exit_error' },
			]);
			// The observed drift: a user-stopped run whose DB row kept NULL exit/stop while
			// the CLI's ledger line carried them.
			await seedRun(db, {
				id: 'run-null-fields',
				projectPath: projectDir,
				status: 'stopped',
			});
			// Explicit values (e.g. stopRun's placeholders) are preserved: fill-NULL-only.
			await seedRun(db, {
				exitCode: 0,
				id: 'run-has-values',
				projectPath: projectDir,
				status: 'completed',
				stopReason: 'completed',
				summary: 'db summary wins',
			});
			// Live rows are never touched even when a (stale) ledger line exists.
			await seedRun(db, {
				id: 'run-still-running',
				projectPath: projectDir,
				status: 'running',
			});

			// Two repairs: run-null-fields gains its terminal fields, and run-has-values gets
			// its NULL continuation_reason evaluated (to 'none') — terminal fields untouched.
			const updated = await reconcileRunLedgerDrift(db);
			expect(updated).toBe(2);

			const filled = (await db.select().from(runs).where(eq(runs.id, 'run-null-fields')))[0];
			expect(filled?.exitCode).toBe(130);
			expect(filled?.stopReason).toBe('stop_requested');
			expect(filled?.summary).toContain('full ledger facts');
			expect(filled?.durationMs).toBe(4321);
			expect(filled?.continuationReason).toBe('none');

			const untouched = (
				await db.select().from(runs).where(eq(runs.id, 'run-has-values'))
			)[0];
			expect(untouched?.exitCode).toBe(0);
			expect(untouched?.stopReason).toBe('completed');
			expect(untouched?.summary).toBe('db summary wins');
			expect(untouched?.continuationReason).toBe('none');

			const running = (
				await db.select().from(runs).where(eq(runs.id, 'run-still-running'))
			)[0];
			expect(running?.exitCode).toBeNull();
			expect(running?.status).toBe('running');
		} finally {
			sqlite.close();
			await rm(projectDir, { force: true, recursive: true });
		}
	});

	test('runs absent from the ledger converge in one sweep, then cost nothing', async () => {
		const projectDir = await testTempDir('aidd-backfill-noop-');
		const { db, sqlite } = makeDb();
		try {
			await seedRun(db, {
				id: 'run-not-in-ledger',
				projectPath: projectDir,
				status: 'failed',
			});
			// The first sweep evaluates the NULL continuation_reason from row facts alone
			// ('none' here) — a ledger line is not required for the row to converge.
			expect(await reconcileRunLedgerDrift(db)).toBe(1);
			const row = (await db.select().from(runs).where(eq(runs.id, 'run-not-in-ledger')))[0];
			expect(row?.continuationReason).toBe('none');
			expect(row?.exitCode).toBeNull();
			// Once evaluated, the row leaves the candidate set: later sweeps are no-ops.
			expect(await reconcileRunLedgerDrift(db)).toBe(0);
		} finally {
			sqlite.close();
			await rm(projectDir, { force: true, recursive: true });
		}
	});
});
