import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';

import { type WebDatabase, wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { invocationEvents, runs } from '../../backend/src/db/schema.ts';
import { getResourceUsage } from '../../backend/src/services/telemetry/aggregation.ts';
import { getProjectCosts } from '../../backend/src/services/telemetry/projectCost.ts';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

let db: WebDatabase;
let now: number;

beforeEach(() => {
	const rawSqlite = new Database(':memory:');
	migrateWebDatabase(rawSqlite);
	db = wrapWebDatabase(rawSqlite).db;
	now = Date.now();
});

async function seedRun(input: { costUsd?: null | number; id: string; startedAt: number }) {
	await db.insert(runs).values({
		backend: 'native',
		costUsd: input.costUsd ?? null,
		exitCode: 0,
		id: input.id,
		projectName: 'demo',
		projectPath: 'd:/applications/demo',
		source: 'web',
		startedAt: input.startedAt,
		status: 'completed',
	});
}

async function seedInvocation(input: {
	id: string;
	projectName?: string;
	projectPath: string;
	resourceType?: 'recipe' | 'run' | 'skill';
	runId?: string;
	startedAt: number;
}) {
	await db.insert(invocationEvents).values({
		id: input.id,
		projectName: input.projectName ?? input.projectPath.split('/').pop() ?? 'demo',
		projectPath: input.projectPath,
		resourceId: input.runId ?? input.id,
		resourceName: input.id,
		resourceType: input.resourceType ?? 'run',
		runId: input.runId,
		source: 'web',
		startedAt: input.startedAt,
		status: 'completed',
	});
}

describe('telemetry project cost aggregation', () => {
	test('rolls every project in the window up separately, most expensive first', async () => {
		await seedRun({ costUsd: 1.25, id: 'run-a1', startedAt: now });
		await seedRun({ costUsd: 4, id: 'run-b1', startedAt: now });
		await seedRun({ costUsd: 0.5, id: 'run-b2', startedAt: now });
		await seedInvocation({
			id: 'inv-a1',
			projectPath: 'd:/apps/alpha',
			runId: 'run-a1',
			startedAt: now - HOUR_MS,
		});
		await seedInvocation({
			id: 'inv-b1',
			projectPath: 'd:/apps/beta',
			runId: 'run-b1',
			startedAt: now - HOUR_MS,
		});
		await seedInvocation({
			id: 'inv-b2',
			projectPath: 'd:/apps/beta',
			runId: 'run-b2',
			startedAt: now,
		});

		const rows = await getProjectCosts(db, { windowMs: 7 * DAY_MS });

		expect(rows).toEqual([
			{
				costUsd: 4.5,
				costedInvocationCount: 2,
				invocationCount: 2,
				lastInvocationAt: now,
				projectName: 'beta',
				projectPath: 'd:/apps/beta',
			},
			{
				costUsd: 1.25,
				costedInvocationCount: 1,
				invocationCount: 1,
				lastInvocationAt: now - HOUR_MS,
				projectName: 'alpha',
				projectPath: 'd:/apps/alpha',
			},
		]);
	});

	test('counts invocations whose cost is unknown without pricing them at zero', async () => {
		// Three ways an invocation can carry no dollars: no run at all, a run the backend never
		// priced, and a run that reported a literal zero (indistinguishable from "not reported").
		await seedRun({ costUsd: null, id: 'run-unpriced', startedAt: now });
		await seedRun({ costUsd: 0, id: 'run-zero', startedAt: now });
		await seedInvocation({
			id: 'inv-skill',
			projectPath: 'd:/apps/gamma',
			resourceType: 'skill',
			startedAt: now,
		});
		await seedInvocation({
			id: 'inv-unpriced',
			projectPath: 'd:/apps/gamma',
			runId: 'run-unpriced',
			startedAt: now,
		});
		await seedInvocation({
			id: 'inv-zero',
			projectPath: 'd:/apps/gamma',
			runId: 'run-zero',
			startedAt: now,
		});

		const rows = await getProjectCosts(db);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			costUsd: 0,
			costedInvocationCount: 0,
			invocationCount: 3,
			projectPath: 'd:/apps/gamma',
		});
	});

	test('reports partial cost coverage as partial', async () => {
		await seedRun({ costUsd: 2, id: 'run-priced', startedAt: now });
		await seedInvocation({
			id: 'inv-priced',
			projectPath: 'd:/apps/delta',
			runId: 'run-priced',
			startedAt: now,
		});
		await seedInvocation({ id: 'inv-bare', projectPath: 'd:/apps/delta', startedAt: now });

		const rows = await getProjectCosts(db);

		expect(rows[0]).toMatchObject({
			costUsd: 2,
			costedInvocationCount: 1,
			invocationCount: 2,
		});
	});

	test('bills a run once even when two invocations name it', async () => {
		// A run invocation and the skill invocation that drove it both point at one billed run.
		await seedRun({ costUsd: 3, id: 'run-shared', startedAt: now });
		await seedInvocation({
			id: 'inv-run',
			projectPath: 'd:/apps/eps',
			runId: 'run-shared',
			startedAt: now,
		});
		await seedInvocation({
			id: 'inv-skill',
			projectPath: 'd:/apps/eps',
			resourceType: 'skill',
			runId: 'run-shared',
			startedAt: now,
		});

		const rows = await getProjectCosts(db);

		expect(rows[0]).toMatchObject({ costUsd: 3, costedInvocationCount: 2, invocationCount: 2 });
	});

	test('omits projects with no invocations in the window and changes with the window', async () => {
		await seedRun({ costUsd: 9, id: 'run-old', startedAt: now - 10 * DAY_MS });
		await seedRun({ costUsd: 1, id: 'run-new', startedAt: now });
		await seedInvocation({
			id: 'inv-old',
			projectPath: 'd:/apps/stale',
			runId: 'run-old',
			startedAt: now - 10 * DAY_MS,
		});
		await seedInvocation({
			id: 'inv-new',
			projectPath: 'd:/apps/fresh',
			runId: 'run-new',
			startedAt: now - HOUR_MS,
		});

		const day = await getProjectCosts(db, { windowMs: DAY_MS });
		const month = await getProjectCosts(db, { windowMs: 30 * DAY_MS });

		expect(day.map((row) => row.projectPath)).toEqual(['d:/apps/fresh']);
		expect(month.map((row) => row.projectPath)).toEqual(['d:/apps/stale', 'd:/apps/fresh']);
	});

	test('narrows to one resource type so the counts still sum to the filtered total', async () => {
		await seedRun({ costUsd: 5, id: 'run-typed', startedAt: now });
		await seedInvocation({
			id: 'inv-run',
			projectPath: 'd:/apps/zeta',
			runId: 'run-typed',
			startedAt: now,
		});
		await seedInvocation({
			id: 'inv-skill',
			projectPath: 'd:/apps/zeta',
			resourceType: 'skill',
			startedAt: now,
		});

		const all = await getProjectCosts(db);
		const skillsOnly = await getProjectCosts(db, { resourceType: 'skill' });

		expect(all[0]).toMatchObject({ costUsd: 5, invocationCount: 2 });
		expect(skillsOnly[0]).toMatchObject({
			costUsd: 0,
			costedInvocationCount: 0,
			invocationCount: 1,
		});
	});

	test('keeps a renamed project as one row, labelled by its most recent name', async () => {
		await seedInvocation({
			id: 'inv-old-name',
			projectName: 'Old name',
			projectPath: 'd:/apps/eta',
			startedAt: now - DAY_MS,
		});
		await seedInvocation({
			id: 'inv-new-name',
			projectName: 'New name',
			projectPath: 'd:/apps/eta',
			startedAt: now,
		});

		const rows = await getProjectCosts(db);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ invocationCount: 2, projectName: 'New name' });
	});

	test('project invocation counts sum to the same filtered total the summary reports', async () => {
		await seedRun({ costUsd: 2, id: 'run-1', startedAt: now });
		await seedInvocation({
			id: 'inv-1',
			projectPath: 'd:/apps/one',
			runId: 'run-1',
			startedAt: now,
		});
		await seedInvocation({ id: 'inv-2', projectPath: 'd:/apps/two', startedAt: now - HOUR_MS });
		await seedInvocation({
			id: 'inv-3',
			projectPath: 'd:/apps/two',
			resourceType: 'skill',
			startedAt: now,
		});
		await seedInvocation({
			id: 'inv-4',
			projectPath: 'd:/apps/three',
			startedAt: now - 10 * DAY_MS,
		});

		// The reconciliation the surface depends on: the per-project rollup and the per-resource
		// rows the summary tiles add up read the same filtered invocation_events set, so any filter
		// that reaches one has to reach the other.
		for (const filters of [
			{},
			{ windowMs: DAY_MS },
			{ resourceType: 'skill' } as const,
			{ resourceType: 'run', windowMs: DAY_MS } as const,
		]) {
			const projects = await getProjectCosts(db, filters);
			const resources = await getResourceUsage(db, filters);
			const projectTotal = projects.reduce((sum, row) => sum + row.invocationCount, 0);
			const resourceTotal = resources.reduce((sum, row) => sum + row.total, 0);

			expect(projectTotal).toBe(resourceTotal);
		}
	});
});
