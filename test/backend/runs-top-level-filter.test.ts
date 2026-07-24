import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { pipelineSessions, runs } from '../../backend/src/db/schema.ts';
import {
	listRunsForProjectPage,
	listRunsPage,
} from '../../backend/src/services/run/historyQueries.ts';
import type { QueriesContext } from '../../backend/src/services/run/queries.ts';

// Non-existent root: the first page scans the project dir for CLI heartbeats, which
// returns [] for a missing dir — keeping the assertions DB-only and hermetic.
const ROOT = 'd:/__aidd_test_top_level__';
const PROJECT = `${ROOT}/projA`;

function makeContext(): QueriesContext {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	const { db, commands } = wrapWebDatabase(sqlite);
	return {
		commands,
		config: {
			web: {
				allowedRoots: [ROOT],
				dataDir: `${ROOT}/data`,
				ignoredFolders: [],
			},
		},
		db,
	} as unknown as QueriesContext;
}

async function seed(ctx: QueriesContext): Promise<void> {
	const base = Date.now();
	await ctx.db.insert(pipelineSessions).values({
		id: 'sess_1',
		parametersJson: '{}',
		projectName: 'projA',
		projectPath: PROJECT,
		recipeId: 'recipe_1',
		recipeName: 'Recipe One',
		startedAt: base - 10,
		status: 'running',
		totalSteps: 3,
	});
	const rows = [
		{ id: 'standalone_0', startedAt: base },
		{ id: 'piped_0', pipelineSessionId: 'sess_1', startedAt: base - 1 },
		{ id: 'standalone_1', startedAt: base - 2 },
		{ id: 'piped_1', pipelineSessionId: 'sess_1', startedAt: base - 3 },
		{ id: 'standalone_2', startedAt: base - 4 },
	];
	for (const row of rows) {
		await ctx.db.insert(runs).values({
			backend: 'native',
			id: row.id,
			mode: 'coding',
			projectName: 'projA',
			projectPath: PROJECT,
			source: 'web',
			startedAt: row.startedAt,
			status: 'completed',
		});
		if (row.pipelineSessionId) {
			await ctx.db
				.update(runs)
				.set({ pipelineSessionId: row.pipelineSessionId })
				.where(eq(runs.id, row.id));
		}
	}
}

describe('runs topLevel filter', () => {
	test('default listing returns pipeline-owned and standalone runs', async () => {
		const ctx = makeContext();
		await seed(ctx);

		const page = await listRunsPage(ctx, { limit: 10 });
		expect(page.items.map((run) => run.id)).toEqual([
			'standalone_0',
			'piped_0',
			'standalone_1',
			'piped_1',
			'standalone_2',
		]);
	});

	test('topLevel excludes pipeline-owned runs from the global listing', async () => {
		const ctx = makeContext();
		await seed(ctx);

		const page = await listRunsPage(ctx, { limit: 10, topLevel: true });
		expect(page.items.map((run) => run.id)).toEqual([
			'standalone_0',
			'standalone_1',
			'standalone_2',
		]);
	});

	test('topLevel keeps cursor pagination exact across the filtered set', async () => {
		const ctx = makeContext();
		await seed(ctx);

		const first = await listRunsPage(ctx, { limit: 2, topLevel: true });
		expect(first.items.map((run) => run.id)).toEqual(['standalone_0', 'standalone_1']);
		if (first.nextCursor === null) throw new Error('expected a next cursor after page one');

		const second = await listRunsPage(ctx, {
			cursor: first.nextCursor,
			limit: 2,
			topLevel: true,
		});
		expect(second.items.map((run) => run.id)).toEqual(['standalone_2']);
		expect(second.nextCursor).toBeNull();
	});

	test('topLevel applies to the project-scoped listing', async () => {
		const ctx = makeContext();
		await seed(ctx);

		const page = await listRunsForProjectPage(ctx, PROJECT, { limit: 10, topLevel: true });
		expect(page.items.map((run) => run.id)).toEqual([
			'standalone_0',
			'standalone_1',
			'standalone_2',
		]);
	});
});
