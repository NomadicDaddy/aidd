import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { directorCycles, runs } from '../../backend/src/db/schema.ts';
import {
	latestProjectAuditRun,
	listRuns,
	listRunsForProjectPage,
	listRunsPage,
} from '../../backend/src/services/run/historyQueries.ts';
import type { QueriesContext } from '../../backend/src/services/run/queryContracts.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

import { testTempDir } from '../_helpers/temp.ts';
interface RunSeed {
	id: string;
	mode?: 'audit' | 'coding' | 'director';
	projectName: string;
	projectPath: string;
	startedAt: number;
	status?: 'completed' | 'running';
}

function seedRun(seed: RunSeed): typeof runs.$inferInsert {
	return {
		backend: 'native',
		id: seed.id,
		mode: seed.mode ?? 'coding',
		projectName: seed.projectName,
		projectPath: seed.projectPath,
		source: 'web',
		startedAt: seed.startedAt,
		status: seed.status ?? 'completed',
	};
}

function makeContext(dataDir = 'd:/__aidd_test_history__/data'): QueriesContext {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	const { db, commands } = wrapWebDatabase(sqlite);
	return {
		commands,
		config: {
			web: {
				allowedRoots: ['d:/__aidd_test_history__'],
				dataDir,
				ignoredFolders: [],
			},
		},
		db,
	} as unknown as QueriesContext;
}

describe('project-scoped run history queries', () => {
	test('latestProjectAuditRun finds a project audit hidden beyond a 50-row global window', async () => {
		const ctx = makeContext();
		const projA = 'd:/applications/projA';
		const projB = 'd:/applications/projB';
		// One older audit for projA, then 60 newer audits for projB. The previous
		// implementation read only the 60 newest audit rows globally and matched in memory,
		// so projA's audit fell outside the window and was reported as missing.
		await ctx.db.insert(runs).values(
			seedRun({
				id: 'audit_a_old',
				mode: 'audit',
				projectName: 'projA',
				projectPath: projA,
				startedAt: 1_000,
			}),
		);
		for (let i = 0; i < 60; i++) {
			await ctx.db.insert(runs).values(
				seedRun({
					id: `audit_b_${i}`,
					mode: 'audit',
					projectName: 'projB',
					projectPath: projB,
					startedAt: 2_000 + i,
				}),
			);
		}

		const latest = await latestProjectAuditRun(ctx, projA);
		expect(latest?.runId).toBe('audit_a_old');
	});

	test('latestProjectAuditRun returns the newest audit run for the project', async () => {
		const ctx = makeContext();
		const projA = 'd:/applications/projA';
		await ctx.db.insert(runs).values(
			seedRun({
				id: 'audit_a1',
				mode: 'audit',
				projectName: 'projA',
				projectPath: projA,
				startedAt: 1_000,
			}),
		);
		await ctx.db.insert(runs).values(
			seedRun({
				id: 'audit_a2',
				mode: 'audit',
				projectName: 'projA',
				projectPath: projA,
				startedAt: 5_000,
			}),
		);
		await ctx.db.insert(runs).values(
			seedRun({
				id: 'audit_a3',
				mode: 'audit',
				projectName: 'projA',
				projectPath: projA,
				startedAt: 3_000,
			}),
		);

		const latest = await latestProjectAuditRun(ctx, projA);
		expect(latest?.runId).toBe('audit_a2');
	});

	test('latestProjectAuditRun tolerates separator-style differences between stored and queried paths', async () => {
		const ctx = makeContext();
		// Stored with backslashes, queried with forward slashes.
		await ctx.db.insert(runs).values(
			seedRun({
				id: 'audit_sep',
				mode: 'audit',
				projectName: 'projSep',
				projectPath: 'd:\\applications\\projSep',
				startedAt: 1_000,
			}),
		);

		const latest = await latestProjectAuditRun(ctx, 'd:/applications/projSep');
		expect(latest?.runId).toBe('audit_sep');
	});

	test('listRunsForProjectPage scopes and paginates within a single project', async () => {
		const ctx = makeContext();
		// Non-existent paths: the first page scans the project dir for CLI heartbeats, which
		// returns [] for a missing dir — keeping the assertions DB-only and hermetic.
		const projA = 'd:/__aidd_test_history__/projA';
		const projB = 'd:/__aidd_test_history__/projB';
		const base = Date.now();
		// Interleave two projects in the recent window so a broad read would mix them.
		for (let i = 0; i < 5; i++) {
			await ctx.db.insert(runs).values(
				seedRun({
					id: `a${i}`,
					projectName: 'projA',
					projectPath: projA,
					startedAt: base - i,
				}),
			);
			await ctx.db.insert(runs).values(
				seedRun({
					id: `b${i}`,
					projectName: 'projB',
					projectPath: projB,
					startedAt: base - i,
				}),
			);
		}

		const first = await listRunsForProjectPage(ctx, projA, { limit: 2 });
		expect(first.items.map((run) => run.id)).toEqual(['a0', 'a1']);
		for (const run of first.items) expect(run.projectPath).toBe(projA);
		if (first.nextCursor === null) throw new Error('expected a next cursor after page one');

		const second = await listRunsForProjectPage(ctx, projA, {
			cursor: first.nextCursor,
			limit: 2,
		});
		expect(second.items.map((run) => run.id)).toEqual(['a2', 'a3']);
		for (const run of second.items) expect(run.projectPath).toBe(projA);
		if (second.nextCursor === null) throw new Error('expected a next cursor after page two');

		const third = await listRunsForProjectPage(ctx, projA, {
			cursor: second.nextCursor,
			limit: 2,
		});
		expect(third.items.map((run) => run.id)).toEqual(['a4']);
		expect(third.nextCursor).toBeNull();
	});

	test('history mapping clears terminal liveness while preserving the stored row', async () => {
		const ctx = makeContext();
		const projectPath = 'd:/__aidd_test_history__/terminal';
		await ctx.db.insert(runs).values({
			...seedRun({
				id: 'terminal_liveness',
				projectName: 'terminal',
				projectPath,
				startedAt: Date.now(),
			}),
			activityState: 'working',
			heartbeatAt: Date.now(),
			logPath: 'logs/terminal.log',
		});

		const page = await listRunsForProjectPage(ctx, projectPath);

		expect(page.items[0]).toMatchObject({
			activityState: null,
			canKill: false,
			canReadOutput: true,
			canStop: false,
			heartbeatAt: null,
			id: 'terminal_liveness',
			status: 'completed',
		});
		const stored = await ctx.db
			.select({ activityState: runs.activityState, heartbeatAt: runs.heartbeatAt })
			.from(runs)
			.where(eq(runs.id, 'terminal_liveness'));
		expect(stored[0]?.activityState).toBe('working');
		expect(stored[0]?.heartbeatAt).not.toBeNull();
	});

	test('listRunsPage projects direct director cycles into the global runs surface', async () => {
		const ctx = makeContext();
		await ctx.db.insert(directorCycles).values({
			aiddDirty: false,
			aiddRevision: '0123456789abcdef',
			aiddVersion: '3.0.0',
			id: 'cycle_direct_running',
			startedAt: Date.now(),
			status: 'running',
		});

		const page = await listRunsPage(ctx);
		const cycleRun = page.items.find((run) => run.id === 'cycle_direct_running');

		expect(cycleRun).toMatchObject({
			aiddDirty: false,
			aiddRevision: '0123456789abcdef',
			aiddVersion: '3.0.0',
			canKill: false,
			canReadOutput: true,
			canStop: false,
			mode: 'director',
			projectName: 'Director',
			source: 'director',
			status: 'running',
		});
		expect(cycleRun?.projectPath).toContain('data');
	});

	test('listRuns includes terminal direct director cycles for matching status filters', async () => {
		const ctx = makeContext();
		await ctx.db.insert(directorCycles).values({
			completedAt: Date.now(),
			id: 'cycle_direct_completed_status',
			startedAt: Date.now() - 100,
			status: 'completed',
			totalSuggestions: 1,
		});

		const runs = await listRuns(ctx, 10, 'completed');
		const cycleRun = runs.find((run) => run.id === 'cycle_direct_completed_status');

		expect(cycleRun).toMatchObject({
			mode: 'director',
			source: 'director',
			status: 'completed',
			summary: 'Director cycle completed with 1 suggestion.',
		});
	});

	test('listRunsPage keeps direct director cycles when director has a run ledger', async () => {
		const dataDir = await testTempDir('aidd-director-runs-');
		const ctx = makeContext(dataDir);
		try {
			await mkdir(join(dataDir, 'director', '.aidd'), { recursive: true });
			await Bun.write(
				join(dataDir, 'director', '.aidd', 'runs.jsonl'),
				`${JSON.stringify({ runId: 'run_cli_backed_director' })}\n`,
			);
			await ctx.db.insert(directorCycles).values({
				completedAt: Date.now(),
				id: 'cycle_direct_completed',
				startedAt: Date.now() - 100,
				status: 'completed',
				totalSuggestions: 3,
			});

			const page = await listRunsPage(ctx);
			const cycleRun = page.items.find((run) => run.id === 'cycle_direct_completed');

			expect(cycleRun?.summary).toBe('Director cycle completed with 3 suggestions.');
		} finally {
			await removeTempTree(dataDir);
		}
	});

	test('listRunsPage does not duplicate director cycles that already have a run row', async () => {
		const ctx = makeContext();
		const startedAt = Date.now();
		await ctx.db.insert(directorCycles).values({
			id: 'cycle_cli_backed',
			startedAt,
			status: 'running',
		});
		await ctx.db.insert(runs).values(
			seedRun({
				id: 'run_cli_backed',
				mode: 'director',
				projectName: 'director',
				projectPath: 'd:/__aidd_test_history__/data/director',
				startedAt,
				status: 'running',
			}),
		);
		await ctx.db
			.update(runs)
			.set({ directorCycleId: 'cycle_cli_backed', source: 'director' })
			.where(eq(runs.id, 'run_cli_backed'));

		const page = await listRunsPage(ctx);

		expect(page.items.map((run) => run.id)).toEqual(['run_cli_backed']);
		expect(page.items[0]?.projectName).toBe('Director');
	});
});
