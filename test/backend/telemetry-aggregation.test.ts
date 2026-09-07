import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';

import { type WebDatabase, wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { invocationEvents, runs } from '../../backend/src/db/schema.ts';
import {
	getResourceUsage,
	getTimeseries,
	rawStatusBuckets,
} from '../../backend/src/services/telemetry/aggregation.ts';
import { getOutputTimeseries } from '../../backend/src/services/telemetry/outputTimeseries.ts';
import { listInvocations } from '../../backend/src/services/telemetry/queries.ts';
import { getBackendUsage } from '../../backend/src/services/telemetry/resourceDetail.ts';
import type { TelemetryInvocationSource } from '../../backend/src/services/telemetry/types.ts';

let db: WebDatabase;
let rawSqlite: Database;

beforeEach(() => {
	rawSqlite = new Database(':memory:');
	migrateWebDatabase(rawSqlite);
	db = wrapWebDatabase(rawSqlite).db;
});

async function seedRun(input: {
	exitCode?: number;
	id: string;
	startedAt: number;
	status: 'completed' | 'failed' | 'killed' | 'running' | 'stopped';
	stopReason?: string;
}) {
	await db.insert(runs).values({
		backend: 'native',
		exitCode: input.exitCode ?? (input.status === 'completed' ? 0 : 1),
		id: input.id,
		projectName: 'demo',
		projectPath: 'd:/applications/demo',
		source: 'web',
		startedAt: input.startedAt,
		status: input.status,
		stopReason: input.stopReason,
	});
}

async function seedInvocation(input: {
	backend?: null | string;
	id: string;
	parentInvocationId?: string;
	resourceType?: 'recipe' | 'run' | 'skill';
	runId?: string;
	source?: TelemetryInvocationSource;
	startedAt: number;
	status: 'completed' | 'failed' | 'killed' | 'running' | 'stopped';
}) {
	await db.insert(invocationEvents).values({
		backend: input.backend ?? null,
		id: input.id,
		parentInvocationId: input.parentInvocationId,
		projectName: 'demo',
		projectPath: 'd:/applications/demo',
		resourceId: input.runId ?? input.id,
		resourceName: input.id,
		resourceType: input.resourceType ?? 'skill',
		runId: input.runId,
		source: input.source ?? (input.parentInvocationId ? 'recipe-step' : 'web'),
		startedAt: input.startedAt,
		status: input.status,
	});
}

describe('telemetry aggregation transparency', () => {
	test('keeps every outcome and invocation hierarchy distinct', async () => {
		const now = Date.now();
		await seedRun({ id: 'run-killed', startedAt: now, status: 'killed', stopReason: 'killed' });
		await seedRun({
			id: 'run-warning',
			startedAt: now,
			status: 'stopped',
			stopReason: 'max_iterations',
		});
		await seedRun({
			id: 'run-no-work',
			startedAt: now,
			status: 'completed',
			stopReason: 'no_work',
		});
		// Provider content-flag refusal: exit 78 keeps it red but in its own bucket.
		await seedRun({
			exitCode: 78,
			id: 'run-flagged',
			startedAt: now,
			status: 'failed',
			stopReason: 'exit_error',
		});
		await seedInvocation({ id: 'completed', startedAt: now, status: 'completed' });
		await seedInvocation({ id: 'failed', startedAt: now, status: 'failed' });
		await seedInvocation({
			id: 'stopped',
			parentInvocationId: 'completed',
			resourceType: 'recipe',
			startedAt: now,
			status: 'stopped',
		});
		await seedInvocation({ id: 'running', startedAt: now, status: 'running' });
		await seedInvocation({
			backend: 'native',
			id: 'killed',
			resourceType: 'run',
			runId: 'run-killed',
			startedAt: now,
			status: 'failed',
		});
		await seedInvocation({
			backend: 'native',
			id: 'no-work',
			resourceType: 'run',
			runId: 'run-no-work',
			startedAt: now,
			status: 'completed',
		});
		await seedInvocation({
			backend: 'native',
			id: 'warning',
			resourceType: 'run',
			runId: 'run-warning',
			startedAt: now,
			status: 'stopped',
		});
		await seedInvocation({
			backend: 'native',
			id: 'flagged',
			resourceType: 'run',
			runId: 'run-flagged',
			startedAt: now,
			status: 'failed',
		});

		const rows = await getResourceUsage(db);
		const totals = rows.reduce(
			(accumulator, row) => ({
				completed: accumulator.completed + row.completed,
				failed: accumulator.failed + row.failed,
				flagged: accumulator.flagged + row.flagged,
				killed: accumulator.killed + row.killed,
				nested: accumulator.nested + row.nested,
				noWork: accumulator.noWork + row.noWork,
				running: accumulator.running + row.running,
				stopped: accumulator.stopped + row.stopped,
				topLevel: accumulator.topLevel + row.topLevel,
				total: accumulator.total + row.total,
				warnings: accumulator.warnings + row.warnings,
			}),
			{
				completed: 0,
				failed: 0,
				flagged: 0,
				killed: 0,
				nested: 0,
				noWork: 0,
				running: 0,
				stopped: 0,
				topLevel: 0,
				total: 0,
				warnings: 0,
			},
		);
		expect(totals).toEqual({
			completed: 1,
			failed: 1,
			flagged: 1,
			killed: 1,
			nested: 1,
			noWork: 1,
			running: 1,
			stopped: 1,
			topLevel: 7,
			total: 8,
			warnings: 1,
		});
		const points = await getTimeseries(db, { bucket: 'day' });
		expect(points).toHaveLength(1);
		expect(points[0]).toMatchObject({
			completed: 1,
			failed: 1,
			flagged: 1,
			killed: 1,
			noWork: 1,
			running: 1,
			stopped: 1,
			total: 8,
			warnings: 1,
		});
	});

	// The dashboard promises every invocation lands in exactly one outcome, and ck_invocation_events_status
	// is what keeps an unhandled status out of the table in the first place. If that constraint is ever
	// widened without teaching the aggregator, the new status would fall through to the `failed` default
	// and be quietly miscounted — so pin the two together rather than trusting them to drift in step.
	test('handles every invocation status the CHECK constraint permits', () => {
		const ddl = rawSqlite
			.query<{ sql: string }, []>(
				"SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'invocation_events'",
			)
			.get();
		const checkClause = /ck_invocation_events_status[^(]*\(([^)]*)\)/.exec(ddl?.sql ?? '');
		expect(checkClause).not.toBeNull();
		const allowed = [...(checkClause?.[1] ?? '').matchAll(/'([^']+)'/g)].map(
			(match) => match[1]!,
		);

		expect(allowed.length).toBeGreaterThan(0);
		expect([...allowed].sort()).toEqual([...rawStatusBuckets].sort());
	});

	test('applies the selected window to backend and recent-invocation queries', async () => {
		const now = Date.now();
		const day = 24 * 60 * 60 * 1000;
		await seedInvocation({
			backend: 'codex',
			id: 'recent',
			startedAt: now,
			status: 'completed',
		});
		await seedInvocation({
			backend: 'native',
			id: 'old',
			startedAt: now - 10 * day,
			status: 'completed',
		});

		expect(await getBackendUsage(db, { windowMs: day })).toEqual([
			{ backend: 'codex', count: 1 },
		]);
		const recent = await listInvocations(db, { limit: 50, windowMs: day });
		expect(recent.map((row) => row.id)).toEqual(['recent']);
		expect(
			(await getTimeseries(db, { bucket: 'day' })).reduce((sum, row) => sum + row.total, 0),
		).toBe(2);
	});

	test('round-trips a scheduled invocation from persistence into the API record', async () => {
		const now = Date.now();
		await seedInvocation({
			id: 'scheduled-skill',
			source: 'scheduled',
			startedAt: now,
			status: 'completed',
		});

		const [invocation] = await listInvocations(db, { limit: 1 });
		expect(invocation).toMatchObject({ id: 'scheduled-skill', source: 'scheduled' });
	});

	// A series that emits only the buckets it has rows for, drawn at equal column width, turns a
	// ten-day gap into one column, and — because the two series would have different gaps — leaves
	// the invocation chart covering a different set of dates from the output chart beneath it.
	test('emits every bucket in the window, zeroes included, on both series', async () => {
		const day = 24 * 60 * 60 * 1000;
		const now = Date.now();
		// One invocation at each end of the window and nothing between: 5 buckets, 3 of them empty.
		await seedRun({ id: 'run-old', startedAt: now - 4 * day, status: 'completed' });
		await seedRun({ id: 'run-new', startedAt: now, status: 'completed' });
		await seedInvocation({
			id: 'old',
			resourceType: 'run',
			runId: 'run-old',
			startedAt: now - 4 * day,
			status: 'completed',
		});
		await seedInvocation({
			id: 'new',
			resourceType: 'run',
			runId: 'run-new',
			startedAt: now,
			status: 'completed',
		});

		const invocations = await getTimeseries(db, { bucket: 'day', windowMs: 5 * day });
		const output = await getOutputTimeseries(db, { bucket: 'day', windowMs: 5 * day });

		expect(invocations).toHaveLength(6);
		expect(invocations.filter((point) => point.total === 0)).toHaveLength(4);
		// Evenly spaced: consecutive buckets are exactly one bucket width apart, so a column's
		// position on the axis is proportional to its time.
		for (let index = 1; index < invocations.length; index += 1) {
			expect(invocations[index]!.bucket - invocations[index - 1]!.bucket).toBe(day);
		}
		// The two charts are stacked on one page under one window control, so they have to agree
		// about which dates they cover.
		expect(output.map((point) => point.bucket)).toEqual(
			invocations.map((point) => point.bucket),
		);
	});
});
