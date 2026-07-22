import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { ResolvedWebConfig } from 'aidd-shared/config';
import type { CliActiveRunRecord } from 'aidd-shared/metadata/active-runs';
import { createWorkerWebDatabase, type WebDatabaseHandle } from '../../backend/src/db/client.ts';
import { deserializeError, serializeError } from '../../backend/src/db/worker/protocol.ts';
import { runs } from '../../backend/src/db/schema.ts';
import { eq } from 'drizzle-orm';

import { testTempDir } from '../_helpers/temp.ts';
function webConfig(rootDir: string): ResolvedWebConfig {
	return {
		allowRemote: false,
		allowedOrigins: [],
		allowedRoots: [rootDir],
		dataDir: join(rootDir, 'data'),
		hostname: '127.0.0.1',
		ignoredFolders: ['.git', 'node_modules'],
		maxConcurrentRuns: 2,
		maxConcurrentRunsPerProject: 2,
		autoChainLimit: 3,
		autoChainRuns: false,
		useWorktrees: false,
		port: 3210,
		spernakitFleetManifest: null,
		spernakitInitScript: null,
		spernakitTemplateRef: null,
		showSpernakitProject: false,
		spernakitTemplateRepo: 'NomadicDaddy/spernakit',
		templates: [],
		traceDataMovement: false,
	};
}

function makeRecord(overrides: Partial<CliActiveRunRecord> = {}): CliActiveRunRecord {
	return {
		aiddDirty: null,
		aiddRevision: null,
		aiddVersion: null,
		aiSummary: null,
		backend: 'native',
		cachedTokens: null,
		commandArgs: null,
		completedAt: null,
		durationMs: null,
		exitCode: null,
		filesChanged: null,
		heartbeatAt: Date.now(),
		id: 'run_worker_1',
		inputTokens: null,
		linesAdded: null,
		linesRemoved: null,
		logPath: null,
		mode: 'coding',
		model: null,
		outputTokens: null,
		pid: null,
		projectName: 'demo',
		projectPath: 'd:/applications/demo',
		provider: null,
		reasoningEffort: null,
		reasoningTokens: null,
		source: 'web',
		startedAt: Date.now(),
		state: 'completed',
		stopFile: 'd:/applications/demo/.aidd/stop',
		stopReason: null,
		summary: null,
		...overrides,
	};
}

describe('DB worker round-trip', () => {
	let rootDir: string;
	let handle: WebDatabaseHandle;

	beforeEach(async () => {
		rootDir = await testTempDir('aidd-db-worker-');
		handle = await createWorkerWebDatabase(webConfig(rootDir), rootDir);
	});

	afterEach(async () => {
		await handle.close();
		// On Windows the OS may hold the just-closed db file briefly after the worker terminates;
		// retry the cleanup instead of failing on a transient EBUSY.
		for (let attempt = 0; attempt < 10; attempt++) {
			try {
				await rm(rootDir, { force: true, recursive: true });
				return;
			} catch {
				await sleep(50);
			}
		}
		await rm(rootDir, { force: true, recursive: true });
	});

	test('executes statements against the worker-owned connection', async () => {
		await handle.db.insert(runs).values({
			backend: 'native',
			id: 'run_rt_1',
			mode: 'coding',
			projectName: 'demo',
			projectPath: 'd:/applications/demo',
			source: 'web',
			startedAt: Date.now(),
			status: 'running',
		});

		const rows = await handle.db.select().from(runs).where(eq(runs.id, 'run_rt_1'));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.status).toBe('running');
	});

	test('terminalizeRun command is atomic and idempotent across the worker boundary', async () => {
		await handle.db.insert(runs).values({
			backend: 'native',
			id: 'run_term_1',
			mode: 'coding',
			projectName: 'demo',
			projectPath: 'd:/applications/demo',
			source: 'web',
			startedAt: Date.now(),
			status: 'running',
		});

		const record = makeRecord({
			aiSummary: 'Completed coding run implementing feature X.',
			id: 'run_term_1',
			exitCode: 0,
			state: 'completed',
			stopReason: 'completed',
		});
		const first = await handle.commands.terminalizeRun({
			completedAt: Date.now(),
			continuationValue: 'none',
			durationMs: 1000,
			finalStatus: 'completed',
			record,
		});
		expect(first.kind).toBe('updated');

		// A second terminalize must observe the now-terminal row and short-circuit.
		const second = await handle.commands.terminalizeRun({
			completedAt: Date.now(),
			continuationValue: 'none',
			durationMs: 1000,
			finalStatus: 'completed',
			record,
		});
		expect(second.kind).toBe('already-terminal');

		const rows = await handle.db.select().from(runs).where(eq(runs.id, 'run_term_1'));
		expect(rows[0]?.status).toBe('completed');
		expect(rows[0]?.stopReason).toBe('completed');
		expect(rows[0]?.aiSummary).toBe('Completed coding run implementing feature X.');
	});

	test('terminalizeRun preserves launcher provenance when a legacy heartbeat has none', async () => {
		await handle.db.insert(runs).values({
			aiddDirty: false,
			aiddRevision: '0123456789abcdef',
			aiddVersion: '2.125.0',
			backend: 'native',
			id: 'run_legacy_heartbeat',
			mode: 'coding',
			projectName: 'demo',
			projectPath: 'd:/applications/demo',
			source: 'web',
			startedAt: Date.now(),
			status: 'running',
		});

		await handle.commands.terminalizeRun({
			completedAt: Date.now(),
			continuationValue: 'none',
			durationMs: 1000,
			finalStatus: 'completed',
			record: makeRecord({
				exitCode: 0,
				id: 'run_legacy_heartbeat',
				state: 'completed',
				stopReason: 'completed',
			}),
		});

		const [row] = await handle.db
			.select()
			.from(runs)
			.where(eq(runs.id, 'run_legacy_heartbeat'));
		expect(row?.aiddDirty).toBe(false);
		expect(row?.aiddRevision).toBe('0123456789abcdef');
		expect(row?.aiddVersion).toBe('2.125.0');
	});

	test('propagates SQLite errors across the worker boundary as rejections', async () => {
		const row = {
			backend: 'native' as const,
			id: 'run_dup_1',
			mode: 'coding' as const,
			projectName: 'demo',
			projectPath: 'd:/applications/demo',
			source: 'web' as const,
			startedAt: Date.now(),
			status: 'running' as const,
		};
		await handle.db.insert(runs).values(row);
		// Re-inserting the same primary key must surface the constraint failure, not hang.
		let threw = false;
		try {
			await handle.db.insert(runs).values(row);
		} catch {
			threw = true;
		}
		expect(threw).toBe(true);
	});

	test('terminalizeRun persists the continuation value, forcing none for pipeline-owned rows', async () => {
		const { pipelineSessions } = await import('../../backend/src/db/schema.ts');
		await handle.db.insert(pipelineSessions).values({
			id: 'ps_gate',
			parametersJson: '{}',
			projectName: 'demo',
			projectPath: 'd:/applications/demo',
			recipeId: 'r',
			recipeName: 'r',
			startedAt: Date.now(),
			status: 'running',
			totalSteps: 1,
		});
		await handle.db.insert(runs).values({
			backend: 'native',
			id: 'run_pipeline_gate',
			mode: 'coding',
			pipelineSessionId: 'ps_gate',
			projectName: 'demo',
			projectPath: 'd:/applications/demo',
			source: 'web',
			startedAt: Date.now(),
			status: 'running',
		});
		await handle.db.insert(runs).values({
			backend: 'native',
			id: 'run_standalone',
			mode: 'coding',
			projectName: 'demo',
			projectPath: 'd:/applications/demo',
			source: 'web',
			startedAt: Date.now(),
			status: 'running',
		});

		await handle.commands.terminalizeRun({
			completedAt: Date.now(),
			continuationValue: 'wall_clock_timeout',
			durationMs: 1000,
			finalStatus: 'failed',
			record: makeRecord({ exitCode: 124, id: 'run_pipeline_gate', state: 'failed' }),
		});
		await handle.commands.terminalizeRun({
			completedAt: Date.now(),
			continuationValue: 'wall_clock_timeout',
			durationMs: 1000,
			finalStatus: 'failed',
			record: makeRecord({ exitCode: 124, id: 'run_standalone', state: 'failed' }),
		});

		const gated = await handle.db.select().from(runs).where(eq(runs.id, 'run_pipeline_gate'));
		expect(gated[0]?.continuationReason).toBe('none');
		const standalone = await handle.db.select().from(runs).where(eq(runs.id, 'run_standalone'));
		expect(standalone[0]?.continuationReason).toBe('wall_clock_timeout');
	});

	test('terminalizeRun inserts aiSummary on the insert path', async () => {
		const record = makeRecord({
			aiSummary: 'AI-generated summary of the run.',
			exitCode: 0,
			id: 'run_ai_summary_insert',
			state: 'completed',
			stopReason: 'completed',
		});
		const result = await handle.commands.terminalizeRun({
			completedAt: Date.now(),
			continuationValue: 'none',
			durationMs: 1000,
			finalStatus: 'completed',
			record,
		});
		expect(result.kind).toBe('inserted');

		const rows = await handle.db
			.select()
			.from(runs)
			.where(eq(runs.id, 'run_ai_summary_insert'));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.aiSummary).toBe('AI-generated summary of the run.');
		expect(rows[0]?.status).toBe('completed');
	});

	test('terminalizeRun leaves aiSummary untouched on already-terminal rows', async () => {
		await handle.db.insert(runs).values({
			aiSummary: 'Original summary.',
			backend: 'native',
			completedAt: Date.now() - 1000,
			durationMs: 500,
			exitCode: 0,
			id: 'run_already_terminal',
			mode: 'coding',
			projectName: 'demo',
			projectPath: 'd:/applications/demo',
			source: 'web',
			startedAt: Date.now() - 2000,
			status: 'completed',
			stopReason: 'completed',
		});

		const record = makeRecord({
			aiSummary: 'New summary that should not overwrite.',
			id: 'run_already_terminal',
			exitCode: 0,
			state: 'completed',
			stopReason: 'completed',
		});
		const result = await handle.commands.terminalizeRun({
			completedAt: Date.now(),
			continuationValue: 'none',
			durationMs: 1000,
			finalStatus: 'completed',
			record,
		});
		expect(result.kind).toBe('already-terminal');

		const rows = await handle.db.select().from(runs).where(eq(runs.id, 'run_already_terminal'));
		expect(rows[0]?.aiSummary).toBe('Original summary.');
	});
});

describe('worker error serialization', () => {
	test('preserves the retryable SQLite code across the structured-clone boundary', () => {
		const original = new Error('database is locked') as Error & { code?: string };
		original.code = 'SQLITE_BUSY';
		const restored = deserializeError(serializeError(original)) as Error & { code?: string };
		expect(restored.message).toBe('database is locked');
		expect(restored.code).toBe('SQLITE_BUSY');
	});
});
