import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import type { WebContext } from '../../backend/src/context.ts';
import type { QueriesContext } from '../../backend/src/services/run/queries.ts';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { pipelineSessions, runs } from '../../backend/src/db/schema.ts';
import { createRunsRoutes } from '../../backend/src/routes/runs.ts';
import {
	annotatedWebRunRecord,
	getRun as getRunRow,
	listRunsPage,
} from '../../backend/src/services/run/queries.ts';
import { listRuns } from '../../frontend/src/api/listRuns.ts';
import { getRun } from '../../frontend/src/api/runs.ts';
import {
	initialSelection,
	needsRunRecordFallback,
} from '../../frontend/src/pages/runs/unifiedEntries.ts';

// Integration test for the deep-linked pipeline-owned-run console seam: the frontend's
// real api functions run against the real runs route + queries over an in-memory DB
// (fetch patched into app.handle). What cannot run headless — React mounting the
// LiveConsolePanel — is covered down to the exact record handed to it.

// Non-existent root keeps the first-page CLI heartbeat scan empty and the test hermetic.
const ROOT = 'd:/__aidd_test_deep_link__';
const PROJECT = `${ROOT}/projA`;

function makeContext(): QueriesContext {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	const { db, commands } = wrapWebDatabase(sqlite);
	return {
		commands,
		config: {
			web: { allowedRoots: [ROOT], dataDir: `${ROOT}/data`, ignoredFolders: [] },
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
		totalSteps: 2,
	});
	for (const row of [
		{ id: 'standalone_0', startedAt: base },
		{ id: 'piped_0', startedAt: base - 1 },
	]) {
		await ctx.db.insert(runs).values({
			backend: 'native',
			id: row.id,
			logPath: `${PROJECT}/.aidd/logs/${row.id}.jsonl`,
			mode: row.id === 'piped_0' ? 'directive' : 'coding',
			projectName: 'projA',
			projectPath: PROJECT,
			source: 'web',
			startedAt: row.startedAt,
			status: 'running',
		});
	}
	await ctx.db.update(runs).set({ pipelineSessionId: 'sess_1' }).where(eq(runs.id, 'piped_0'));
}

function makeApp(ctx: QueriesContext) {
	// Real route module over the real query functions — only the service object is assembled
	// by hand, mirroring RunQueryService's delegation exactly.
	return createRunsRoutes({
		runService: {
			getRunRecord: async (id: string) => {
				const row = await getRunRow(ctx.db, id);
				return row ? annotatedWebRunRecord(row) : undefined;
			},
			listRunsPage: (options: Parameters<typeof listRunsPage>[1]) =>
				listRunsPage(ctx, options),
		},
	} as unknown as WebContext);
}

async function withAppFetch<T>(
	app: ReturnType<typeof createRunsRoutes>,
	run: () => Promise<T>,
): Promise<T> {
	const original = globalThis.fetch;
	globalThis.fetch = ((input: Request | string | URL, init?: RequestInit) => {
		const url =
			typeof input === 'string' || input instanceof URL
				? new URL(input, 'http://localhost')
				: new URL(input.url, 'http://localhost');
		return app.handle(new Request(url, init));
	}) as typeof fetch;
	try {
		return await run();
	} finally {
		globalThis.fetch = original;
	}
}

describe('deep-linked pipeline-owned-run console (integration)', () => {
	test('?run= to a pipeline child resolves via the fallback fetch to a console-ready record', async () => {
		const ctx = makeContext();
		await seed(ctx);
		const app = makeApp(ctx);

		await withAppFetch(app, async () => {
			// 1. The unified feed's list excludes the pipeline-owned run.
			const page = await listRuns({ topLevel: true });
			const listedIds = page.runs.map((run) => run.id);
			expect(listedIds).toContain('standalone_0');
			expect(listedIds).not.toContain('piped_0');

			// 2. The ?run= deep link therefore misses the list and engages the fallback —
			// exactly the enablement condition useRunsPage passes to useRunRecord.
			const selection = initialSelection(new URLSearchParams('run=piped_0'));
			expect(selection).toEqual({ id: 'piped_0', kind: 'run' });
			expect(needsRunRecordFallback(selection, page.runs)).toBe(true);

			// 3. The fallback fetch (frontend getRun → real /api/v1/runs/:id → real queries)
			// returns the record useRunsPage hands to LiveConsolePanel as selectedRun.
			const listedRun = page.runs.find((run) => run.id === selection?.id);
			const fallbackRun = await getRun('piped_0');
			const selectedRun = listedRun ?? fallbackRun ?? undefined;
			if (!selectedRun) throw new Error('expected the fallback fetch to resolve the run');

			// The fields LiveConsolePanel branches on: canReadOutput gates the live-output
			// subscription; a non-terminal status keeps the waiting affordance (not the
			// "completed without output" copy); the session link ties it back to its pipeline.
			expect(selectedRun.id).toBe('piped_0');
			expect(selectedRun.canReadOutput).toBe(true);
			expect(selectedRun.status).toBe('running');
			expect(selectedRun.pipelineSessionId).toBe('sess_1');
		});
	});

	test('a listed run resolves from the list without engaging the fallback', async () => {
		const ctx = makeContext();
		await seed(ctx);
		const app = makeApp(ctx);

		await withAppFetch(app, async () => {
			const page = await listRuns({ topLevel: true });
			const selection = initialSelection(new URLSearchParams('run=standalone_0'));
			expect(needsRunRecordFallback(selection, page.runs)).toBe(false);
			expect(page.runs.find((run) => run.id === selection?.id)?.id).toBe('standalone_0');
		});
	});

	test('the fallback surfaces a missing run as null rather than a phantom record', async () => {
		const ctx = makeContext();
		await seed(ctx);
		const app = makeApp(ctx);

		await withAppFetch(app, async () => {
			expect(await getRun('no_such_run')).toBeNull();
		});
	});
});
