import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { type WebDatabase, wrapWebDatabase } from '../../backend/src/db/client.ts';
import type { DbCommands } from '../../backend/src/db/commands.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { invocationEvents, runs } from '../../backend/src/db/schema.ts';
import {
	getResourceUsage,
	getTimeseries,
} from '../../backend/src/services/telemetry/aggregation.ts';
import { TelemetryService } from '../../backend/src/services/telemetryService.ts';

interface RunSeed {
	id: string;
	status?: 'completed' | 'failed' | 'killed' | 'running' | 'stopped';
	stopReason?: string | null;
	exitCode?: number | null;
	summary?: string | null;
	completedAt?: number | null;
	durationMs?: number | null;
	errorMessage?: string | null;
}

interface InvocationSeed {
	id: string;
	runId?: string | null;
	status?: 'completed' | 'failed' | 'killed' | 'running' | 'stopped';
	resourceType?: 'skill' | 'recipe' | 'run';
	resourceId?: string;
	startedAt?: number;
}

let db: WebDatabase;
let commands: DbCommands;

function seedRun(seed: RunSeed): Promise<unknown> {
	return db.insert(runs).values({
		backend: 'native',
		completedAt: seed.completedAt ?? null,
		durationMs: seed.durationMs ?? null,
		errorMessage: seed.errorMessage ?? null,
		exitCode: seed.exitCode ?? null,
		id: seed.id,
		projectName: 'demo',
		projectPath: 'd:/applications/demo',
		source: 'web',
		startedAt: 1_000,
		status: seed.status ?? 'running',
		stopReason: seed.stopReason ?? null,
		summary: seed.summary ?? null,
	});
}

function seedInvocation(seed: InvocationSeed): Promise<unknown> {
	return db.insert(invocationEvents).values({
		id: seed.id,
		projectName: 'demo',
		projectPath: 'd:/applications/demo',
		resourceId: seed.resourceId ?? seed.runId ?? seed.id,
		resourceName: 'demo resource',
		resourceType: seed.resourceType ?? 'run',
		runId: seed.runId ?? null,
		source: 'web',
		startedAt: seed.startedAt ?? Date.now(),
		status: seed.status ?? 'running',
	});
}

async function getInvocation(id: string) {
	const rows = await db.select().from(invocationEvents).where(eq(invocationEvents.id, id));
	return rows[0];
}

beforeEach(() => {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	const wrapped = wrapWebDatabase(sqlite);
	db = wrapped.db;
	commands = wrapped.commands;
});

describe('reconcileInvocationFromRun', () => {
	test('syncs a stopped run onto its running invocation (not failed)', async () => {
		await seedRun({
			id: 'run_stop',
			status: 'stopped',
			stopReason: 'stop_requested',
			exitCode: 0,
			completedAt: 5_000,
			durationMs: 4_000,
		});
		await seedInvocation({ id: 'inv_stop', runId: 'run_stop' });

		const synced = await commands.reconcileInvocationFromRun({ runId: 'run_stop' });
		expect(synced).toBe(1);

		const inv = await getInvocation('inv_stop');
		expect(inv?.status).toBe('stopped');
		expect(inv?.exitCode).toBe(0);
		expect(inv?.completedAt).toBe(5_000);
		expect(inv?.durationMs).toBe(4_000);
	});

	test('is a no-op when the run has no telemetry row or is unknown', async () => {
		await seedRun({ id: 'run_orphan', status: 'killed', exitCode: -1 });
		expect(await commands.reconcileInvocationFromRun({ runId: 'run_orphan' })).toBe(0);
		expect(await commands.reconcileInvocationFromRun({ runId: 'does_not_exist' })).toBe(0);
	});
});

describe('recordStart fast-run reconciliation', () => {
	test('a skill launch whose run already terminalized lands terminal, not stuck running', async () => {
		const telemetry = new TelemetryService({ commands, db });
		// The race: the run completed before its telemetry row was inserted.
		await seedRun({
			id: 'run_fast',
			status: 'completed',
			stopReason: 'completed',
			exitCode: 0,
			completedAt: 5_000,
			durationMs: 4_000,
		});
		const id = await telemetry.recordStart({
			projectName: 'demo',
			projectPath: 'd:/applications/demo',
			resourceId: 'demo-skill',
			resourceName: 'demo skill',
			resourceType: 'skill',
			runId: 'run_fast',
			source: 'web',
			startedAt: 1_000,
		});
		expect(id).toBeDefined();
		const inv = await getInvocation(id as string);
		expect(inv?.status).toBe('completed');
		expect(inv?.exitCode).toBe(0);
		expect(inv?.completedAt).toBe(5_000);
	});

	test('a skill launch whose run is still running stays running', async () => {
		const telemetry = new TelemetryService({ commands, db });
		await seedRun({ id: 'run_live', status: 'running' });
		const id = await telemetry.recordStart({
			projectName: 'demo',
			projectPath: 'd:/applications/demo',
			resourceId: 'demo-skill',
			resourceName: 'demo skill',
			resourceType: 'skill',
			runId: 'run_live',
			source: 'web',
			startedAt: 1_000,
		});
		const inv = await getInvocation(id as string);
		expect(inv?.status).toBe('running');
	});
});

describe('reconcileStaleInvocations', () => {
	test('syncs run-backed rows from runs, leaves resumed runs running, fails unlinked rows', async () => {
		await seedRun({ id: 'run_terminal', status: 'failed', exitCode: 1, completedAt: 9_000 });
		await seedRun({ id: 'run_resumed', status: 'running' });
		await seedInvocation({ id: 'inv_terminal', runId: 'run_terminal' });
		await seedInvocation({ id: 'inv_resumed', runId: 'run_resumed' });
		await seedInvocation({ id: 'inv_unlinked', runId: null, resourceType: 'skill' });

		const reconciled = await commands.reconcileStaleInvocations({ now: 10_000 });
		expect(reconciled).toBe(2);

		expect((await getInvocation('inv_terminal'))?.status).toBe('failed');
		expect((await getInvocation('inv_terminal'))?.exitCode).toBe(1);
		// A genuinely resumed run keeps its invocation running rather than being force-failed.
		expect((await getInvocation('inv_resumed'))?.status).toBe('running');
		// No run linkage → cannot resume → failed as before.
		expect((await getInvocation('inv_unlinked'))?.status).toBe('failed');
	});
});

describe('telemetry aggregation buckets', () => {
	test('a warnings run lands in warnings, not failed, across usage and timeseries', async () => {
		await seedRun({
			id: 'run_warn',
			status: 'failed',
			stopReason: 'blocked',
			exitCode: 7,
			summary: 'completion_marker_missing_or_unaccepted: completed feature demo',
		});
		await seedRun({ id: 'run_fail', status: 'failed', stopReason: 'exit_error', exitCode: 1 });
		await seedRun({ id: 'run_ok', status: 'completed', stopReason: 'completed', exitCode: 0 });
		await seedInvocation({ id: 'inv_warn', runId: 'run_warn', status: 'failed' });
		await seedInvocation({ id: 'inv_fail', runId: 'run_fail', status: 'failed' });
		await seedInvocation({ id: 'inv_ok', runId: 'run_ok', status: 'completed' });
		// A non-run invocation has no warning concept and buckets by raw status.
		await seedInvocation({
			id: 'inv_skill',
			runId: null,
			resourceType: 'skill',
			resourceId: 'skill_demo',
			status: 'failed',
		});

		const usage = await getResourceUsage(db);
		const totals = usage.reduce(
			(acc, row) => ({
				completed: acc.completed + row.completed,
				failed: acc.failed + row.failed,
				warnings: acc.warnings + row.warnings,
			}),
			{ completed: 0, failed: 0, warnings: 0 },
		);
		expect(totals.completed).toBe(1);
		expect(totals.warnings).toBe(1);
		// run_fail + the unlinked failed skill = 2 hard failures; the warnings run is excluded.
		expect(totals.failed).toBe(2);

		const series = await getTimeseries(db, {
			bucket: 'day',
			windowMs: 7 * 24 * 60 * 60 * 1000,
		});
		const point = series.reduce(
			(acc, row) => ({
				completed: acc.completed + row.completed,
				failed: acc.failed + row.failed,
				warnings: acc.warnings + row.warnings,
			}),
			{ completed: 0, failed: 0, warnings: 0 },
		);
		expect(point.completed).toBe(1);
		expect(point.warnings).toBe(1);
		expect(point.failed).toBe(2);
	});
});
