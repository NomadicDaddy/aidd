import { Database } from 'bun:sqlite';
import {
	type CliActiveRunRecord,
	createCliActiveRunRecord,
} from 'aidd-shared/metadata/active-runs';
import {
	createFeatureLeaseService,
	resolveFeatureLeaseDir,
} from 'aidd-shared/metadata/feature-leases';
import {
	hasUnfinalizedAgentResultMarker,
	unfinalizedAgentResultMarker,
} from 'aidd-shared/runs/outcome';
import { eq } from 'drizzle-orm';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { runs } from '../../backend/src/db/schema.ts';
import { markStale } from '../../backend/src/services/run/heartbeatTransitions.ts';
import {
	extractTerminalAgentResult,
	recoverRunLogEvidence,
	STALE_RESULT_LOG_TAIL_BYTES,
} from '../../backend/src/services/run/staleResultRecovery.ts';
import { TelemetryService } from '../../backend/src/services/telemetryService.ts';
import { WebSocketHub } from '../../backend/src/webSocketHub.ts';

import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

const fixturesDir = join(import.meta.dir, '..', 'fixtures', 'run-result-recovery');

async function recoverResultFromLog(logPath: null | string) {
	return (await recoverRunLogEvidence(logPath))?.result;
}

function makeDb() {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	migrateWebDatabase(sqlite);
	return { sqlite, ...wrapWebDatabase(sqlite) };
}

function makeRecord(
	projectDir: string,
	logPath: null | string,
	overrides: { commandArgs?: string[]; mode?: 'audit' | 'coding' } = {},
): CliActiveRunRecord {
	return createCliActiveRunRecord({
		backend: 'codex',
		commandArgs: overrides.commandArgs ?? null,
		id: 'run_stale_result_recovery',
		logPath,
		mode: overrides.mode ?? 'coding',
		model: 'gpt-5',
		projectDir,
		provider: undefined,
		reasoningEffort: 'high',
		source: 'cli',
	});
}

function agentMessageLine(result: unknown): string {
	return `${JSON.stringify({
		item: { text: `AIDD_RESULT: ${JSON.stringify(result)}`, type: 'agent_message' },
		type: 'item.completed',
	})}\n`;
}

const auditPayload = {
	auditReports: [
		{
			auditFindings: [
				{
					affectedFiles: ['backend/src/services/run/heartbeatTransitions.ts'],
					description:
						'The reaper discarded a parsed result.\nVerified: read backend/src/services/run/heartbeatTransitions.ts:195 and found the payload unused.',
					severity: 'High',
					spec: 'Persist the recovered audit payload instead of dropping it.',
					title: 'Stale reaper drops a recovered audit payload',
				},
			],
			auditName: 'RECOVERY',
			reportMarkdown: '# RECOVERY Audit Report\n\nOne finding.',
		},
	],
};

// A dead audit run whose log holds the payload above, with a `running` row to reap.
async function seedAuditRun(
	projectDir: string,
	db: ReturnType<typeof makeDb>['db'],
): Promise<CliActiveRunRecord> {
	await mkdir(join(projectDir, '.aidd', 'active-runs'), { recursive: true });
	const logPath = join(projectDir, 'run.log');
	await writeFile(logPath, agentMessageLine(auditPayload));
	const record = makeRecord(projectDir, logPath, {
		commandArgs: ['bun', 'cli/src/index.ts', '--audit', 'RECOVERY,OTHER'],
		mode: 'audit',
	});
	await db.insert(runs).values({
		backend: record.backend,
		id: record.id,
		mode: record.mode,
		projectName: record.projectName,
		projectPath: record.projectPath,
		source: 'web',
		startedAt: record.startedAt,
		status: 'running',
	});
	return record;
}

async function fixture(name: string): Promise<string> {
	return readFile(join(fixturesDir, name), 'utf8');
}

// Leases live under git's common dir, so a lease assertion needs a real repository to land in.
async function gitInitRepo(dir: string): Promise<void> {
	const proc = Bun.spawn(['git', 'init', dir], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if ((await proc.exited) !== 0) {
		throw new Error(`git init failed: ${await new Response(proc.stderr).text()}`);
	}
}

describe('stale run result recovery', () => {
	test('extracts only the final structured agent message from the three real log shapes', async () => {
		expect(extractTerminalAgentResult(await fixture('positive.jsonl'))).toEqual({
			featureId:
				'audit-logic-1784361723-rss-pubdate-and-sitemap-lastmod-are-build-machine-timezone-dependent',
			passes: true,
			status: 'completed',
		});
		expect(extractTerminalAgentResult(await fixture('prose-negative.jsonl'))).toBeUndefined();
		expect(
			extractTerminalAgentResult(await fixture('ansi-narration-negative.jsonl')),
		).toBeUndefined();
		expect(
			extractTerminalAgentResult(
				`${JSON.stringify({
					item: {
						text: '\u001b[32mAIDD_RESULT: {"directiveCompleted":true}\u001b[0m',
						type: 'agent_message',
					},
					type: 'item.completed',
				})}\n`,
			),
		).toEqual({ directiveCompleted: true });
	});

	test('widens the tail past its window and fails closed for missing, unreadable, empty, and truncated logs', async () => {
		const projectDir = await testTempDir('aidd-stale-log-');
		try {
			const logPath = join(projectDir, 'large.log');
			const padding = 'x'.repeat(STALE_RESULT_LOG_TAIL_BYTES + 1024);
			await writeFile(logPath, `${padding}\n${await fixture('positive.jsonl')}`);
			expect(await recoverResultFromLog(logPath)).toMatchObject({
				passes: true,
				status: 'completed',
			});
			// A result line wider than the starting window can be lost twice over: the window
			// cannot hold it, and the fragment it does hold is dropped as a partial line. This is
			// exactly the batch-audit case, where the whole run's product rides on one line.
			const wideResult = agentMessageLine({
				passes: true,
				status: 'completed',
				transcript: 'y'.repeat(STALE_RESULT_LOG_TAIL_BYTES + 4096),
			});
			await writeFile(logPath, `${padding}\n${wideResult}`);
			expect(await recoverResultFromLog(logPath)).toMatchObject({
				passes: true,
				status: 'completed',
			});

			// Trailing noise pushes the result out of the first window entirely.
			await writeFile(
				logPath,
				`${await fixture('positive.jsonl')}${'{"type":"noise"}\n'.repeat(20000)}`,
			);
			expect(await recoverResultFromLog(logPath)).toMatchObject({ status: 'completed' });

			await writeFile(logPath, '');
			expect(await recoverResultFromLog(logPath)).toBeUndefined();
			await writeFile(
				logPath,
				'{"type":"item.completed","item":{"type":"agent_message","text":"AIDD_RESULT: {',
			);
			expect(await recoverResultFromLog(logPath)).toBeUndefined();
			expect(await recoverResultFromLog(join(projectDir, 'missing.log'))).toBeUndefined();
			const unreadablePath = join(projectDir, 'directory-not-a-log');
			await mkdir(unreadablePath);
			expect(await recoverResultFromLog(unreadablePath)).toBeUndefined();
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('marks the row failed while persisting one recovered-result marker', async () => {
		const projectDir = await testTempDir('aidd-stale-row-');
		const { commands, db, sqlite } = makeDb();
		try {
			await mkdir(join(projectDir, '.aidd', 'active-runs'), { recursive: true });
			const logPath = join(projectDir, 'run.log');
			await writeFile(logPath, await fixture('positive.jsonl'));
			const record = makeRecord(projectDir, logPath);
			await db.insert(runs).values({
				backend: record.backend,
				id: record.id,
				mode: record.mode,
				projectName: record.projectName,
				projectPath: record.projectPath,
				source: 'web',
				startedAt: record.startedAt,
				status: 'running',
			});
			const telemetry = new TelemetryService({ commands, db });
			const context = {
				commands,
				db,
				hub: new WebSocketHub(),
				tailWatchers: new Map(),
				telemetry,
			};

			await markStale(context, record);
			const row = (await db.select().from(runs).where(eq(runs.id, record.id)))[0];
			expect(row).toMatchObject({
				exitCode: -1,
				status: 'failed',
				stopReason: 'heartbeat_stale',
			});
			expect(hasUnfinalizedAgentResultMarker(row?.summary)).toBe(true);
			expect(row?.summary?.match(new RegExp(unfinalizedAgentResultMarker, 'g'))).toHaveLength(
				1,
			);

			// A duplicate sweep sees an already-terminal row and cannot append the marker again.
			await markStale(context, record);
			const repeated = (await db.select().from(runs).where(eq(runs.id, record.id)))[0];
			expect(
				repeated?.summary?.match(new RegExp(unfinalizedAgentResultMarker, 'g')),
			).toHaveLength(1);
		} finally {
			sqlite.close();
			await removeTempTree(projectDir);
		}
	});

	// Regression: a batch audit spent half an hour producing every report, emitted them all in
	// one final message, and lost the lot because the CLI process died in the seconds before it
	// could write them. The payload fully determines the artifacts, so the reaper writes them.
	test('replays a recovered audit payload into reports and finding features', async () => {
		const projectDir = await testTempDir('aidd-stale-audit-');
		const { commands, db, sqlite } = makeDb();
		try {
			const record = await seedAuditRun(projectDir, db);
			await markStale(
				{
					commands,
					db,
					hub: new WebSocketHub(),
					tailWatchers: new Map(),
					telemetry: new TelemetryService({ commands, db }),
				},
				record,
			);

			const reports = await readdir(join(projectDir, '.aidd', 'audit-reports'));
			expect(reports).toHaveLength(1);
			expect(reports[0]).toStartWith('RECOVERY-');
			expect(
				await readFile(
					join(projectDir, '.aidd', 'audit-reports', reports[0] ?? ''),
					'utf8',
				),
			).toContain('# RECOVERY Audit Report');

			const featureDirs = await readdir(join(projectDir, '.aidd', 'features'));
			expect(featureDirs).toHaveLength(1);
			const feature = JSON.parse(
				await readFile(
					join(projectDir, '.aidd', 'features', featureDirs[0] ?? '', 'feature.json'),
					'utf8',
				),
			);
			expect(feature).toMatchObject({
				auditSource: 'RECOVERY',
				category: 'Audit',
				status: 'backlog',
				title: 'Stale reaper drops a recovered audit payload',
			});
			const findingEvents = (
				await readFile(join(projectDir, '.aidd', 'findings-ledger.jsonl'), 'utf8')
			)
				.trim()
				.split(/\r?\n/u)
				.map((line) => JSON.parse(line));
			expect(findingEvents).toEqual([
				expect.objectContaining({
					event: 'emitted',
					featureId: feature.id,
					runId: record.id,
				}),
			]);

			// The run still failed — only the artifacts were salvaged — and the summary says so
			// rather than leaving the last heartbeat line to imply it died before doing the work.
			const row = (await db.select().from(runs).where(eq(runs.id, record.id)))[0];
			expect(row).toMatchObject({ status: 'failed', stopReason: 'heartbeat_stale' });
			expect(row?.summary).toContain('recovered 1 audit report(s) and 1 new finding(s)');
		} finally {
			sqlite.close();
			await removeTempTree(projectDir);
		}
	});

	// The replay is gated on winning the atomic stale transition, because it is not a safe
	// operation to repeat: a second pass would rewrite the same day's report file over the one
	// already on disk. Every sweep after the first sees an already-terminal row and must stop.
	test('leaves replayed artifacts untouched when the terminal transition was already lost', async () => {
		const projectDir = await testTempDir('aidd-stale-audit-dup-');
		const { commands, db, sqlite } = makeDb();
		try {
			const record = await seedAuditRun(projectDir, db);
			const context = {
				commands,
				db,
				hub: new WebSocketHub(),
				tailWatchers: new Map(),
				telemetry: new TelemetryService({ commands, db }),
			};
			await markStale(context, record);

			const reportsDir = join(projectDir, '.aidd', 'audit-reports');
			const reports = await readdir(reportsDir);
			expect(reports).toHaveLength(1);
			const reportPath = join(reportsDir, reports[0] ?? '');
			// Stand-in for an edit made after recovery: if a duplicate sweep replays, it clobbers it.
			await writeFile(reportPath, 'edited after recovery');
			const featuresBefore = await readdir(join(projectDir, '.aidd', 'features'));

			await markStale(context, record);
			expect(await readFile(reportPath, 'utf8')).toBe('edited after recovery');
			expect(await readdir(reportsDir)).toEqual(reports);
			expect(await readdir(join(projectDir, '.aidd', 'features'))).toEqual(featuresBefore);
			const row = (await db.select().from(runs).where(eq(runs.id, record.id)))[0];
			expect(
				row?.summary?.match(/recovered 1 audit report\(s\) and 1 new finding\(s\)/g),
			).toHaveLength(1);
		} finally {
			sqlite.close();
			await removeTempTree(projectDir);
		}
	});

	// The row is the claim. If it never went terminal the run is still retryable, so artifacts
	// written ahead of the write would be a phantom result attached to a run nothing reaped.
	test('writes no artifacts when the stale transition itself fails', async () => {
		const projectDir = await testTempDir('aidd-stale-audit-dbfail-');
		const { commands, db, sqlite } = makeDb();
		try {
			const record = await seedAuditRun(projectDir, db);
			await markStale(
				{
					commands: {
						...commands,
						markRunStale: () => Promise.reject(new Error('disk I/O error')),
					},
					db,
					hub: new WebSocketHub(),
					tailWatchers: new Map(),
					telemetry: new TelemetryService({ commands, db }),
				},
				record,
			);

			expect(
				await readdir(join(projectDir, '.aidd', 'audit-reports')).catch(() => null),
			).toBe(null);
			expect(await readdir(join(projectDir, '.aidd', 'features')).catch(() => null)).toBe(
				null,
			);
			const row = (await db.select().from(runs).where(eq(runs.id, record.id)))[0];
			expect(row).toMatchObject({ status: 'running', summary: null });
		} finally {
			sqlite.close();
			await removeTempTree(projectDir);
		}
	});

	test('preserves the standard stale failure when no agent result is recoverable', async () => {
		const projectDir = await testTempDir('aidd-stale-no-result-');
		const { commands, db, sqlite } = makeDb();
		try {
			const record = makeRecord(projectDir, join(projectDir, 'missing.log'));
			await db.insert(runs).values({
				backend: record.backend,
				id: record.id,
				mode: record.mode,
				projectName: record.projectName,
				projectPath: record.projectPath,
				source: 'web',
				startedAt: record.startedAt,
				status: 'running',
			});
			await markStale(
				{
					commands,
					db,
					hub: new WebSocketHub(),
					tailWatchers: new Map(),
					telemetry: new TelemetryService({ commands, db }),
				},
				record,
			);
			const row = (await db.select().from(runs).where(eq(runs.id, record.id)))[0];
			expect(row).toMatchObject({
				exitCode: -1,
				status: 'failed',
				stopReason: 'heartbeat_stale',
				summary: null,
			});
			expect(hasUnfinalizedAgentResultMarker(row?.summary)).toBe(false);
		} finally {
			sqlite.close();
			await removeTempTree(projectDir);
		}
	});

	// Regression: a run reaped for a stale heartbeat kept its feature leases forever. The two
	// paths that reap leases (activeRunSweep, boot reconcile) scan only non-terminal rows, and
	// markStale drives the row terminal — so nothing ever released them, and the feature stayed
	// locked against later runs until the holder pid happened to be reused or reclaimed.
	test('releases the dead run feature leases, leaving other runs holdings alone', async () => {
		const projectDir = await testTempDir('aidd-stale-lease-');
		const { commands, db, sqlite } = makeDb();
		try {
			await gitInitRepo(projectDir);
			const record = makeRecord(projectDir, null);
			const leaseDir = await resolveFeatureLeaseDir(projectDir);
			expect(leaseDir).not.toBeNull();
			const mine = createFeatureLeaseService({
				pid: record.pid ?? process.pid,
				projectDir,
				runId: record.id,
			});
			const other = createFeatureLeaseService({
				pid: process.pid,
				projectDir,
				runId: 'run_still_alive',
			});
			expect((await mine.acquire('feature-held-by-dead-run')).acquired).toBe(true);
			expect((await other.acquire('feature-held-by-live-run')).acquired).toBe(true);

			await db.insert(runs).values({
				backend: record.backend,
				id: record.id,
				mode: record.mode,
				projectName: record.projectName,
				projectPath: record.projectPath,
				source: 'web',
				startedAt: record.startedAt,
				status: 'running',
			});
			await markStale(
				{
					commands,
					db,
					hub: new WebSocketHub(),
					tailWatchers: new Map(),
					telemetry: new TelemetryService({ commands, db }),
				},
				record,
			);

			const remaining = await readdir(leaseDir ?? '');
			expect(remaining).toEqual(['feature-held-by-live-run.json']);
		} finally {
			sqlite.close();
			await removeTempTree(projectDir);
		}
	});
});
