import { Database } from 'bun:sqlite';
import {
	type CliActiveRunRecord,
	createCliActiveRunRecord,
} from 'aidd-shared/metadata/active-runs';
import {
	hasUnfinalizedAgentResultMarker,
	unfinalizedAgentResultMarker,
} from 'aidd-shared/runs/outcome';
import { eq } from 'drizzle-orm';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { runs } from '../../backend/src/db/schema.ts';
import { markStale } from '../../backend/src/services/run/heartbeatTransitions.ts';
import {
	extractTerminalAgentResult,
	recoverResultFromRunLog,
	STALE_RESULT_LOG_TAIL_BYTES,
} from '../../backend/src/services/run/staleResultRecovery.ts';
import { TelemetryService } from '../../backend/src/services/telemetryService.ts';
import { WebSocketHub } from '../../backend/src/webSocketHub.ts';

import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

const fixturesDir = join(import.meta.dir, '..', 'fixtures', 'run-result-recovery');

function makeDb() {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	migrateWebDatabase(sqlite);
	return { sqlite, ...wrapWebDatabase(sqlite) };
}

function makeRecord(projectDir: string, logPath: null | string): CliActiveRunRecord {
	return createCliActiveRunRecord({
		backend: 'codex',
		id: 'run_stale_result_recovery',
		logPath,
		mode: 'coding',
		model: 'gpt-5',
		projectDir,
		provider: undefined,
		reasoningEffort: 'high',
		source: 'cli',
	});
}

async function fixture(name: string): Promise<string> {
	return readFile(join(fixturesDir, name), 'utf8');
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

	test('reads only a bounded tail and fails closed for missing, unreadable, empty, and truncated logs', async () => {
		const projectDir = await testTempDir('aidd-stale-log-');
		try {
			const logPath = join(projectDir, 'large.log');
			const padding = 'x'.repeat(STALE_RESULT_LOG_TAIL_BYTES + 1024);
			await writeFile(logPath, `${padding}\n${await fixture('positive.jsonl')}`);
			expect(await recoverResultFromRunLog(logPath)).toMatchObject({
				passes: true,
				status: 'completed',
			});
			await writeFile(logPath, '');
			expect(await recoverResultFromRunLog(logPath)).toBeUndefined();
			await writeFile(
				logPath,
				'{"type":"item.completed","item":{"type":"agent_message","text":"AIDD_RESULT: {',
			);
			expect(await recoverResultFromRunLog(logPath)).toBeUndefined();
			expect(await recoverResultFromRunLog(join(projectDir, 'missing.log'))).toBeUndefined();
			const unreadablePath = join(projectDir, 'directory-not-a-log');
			await mkdir(unreadablePath);
			expect(await recoverResultFromRunLog(unreadablePath)).toBeUndefined();
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
});
