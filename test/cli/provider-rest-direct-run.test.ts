import { parseArgs } from 'aidd-shared/args/index';
import { defaultWebConfig, type ResolvedConfig } from 'aidd-shared/config';
import { readCliActiveRunRecords } from 'aidd-shared/metadata/active-runs';
import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { runs } from '../../backend/src/db/schema.ts';
import { toCliRunRecord } from '../../backend/src/services/run/cliActiveRunRecord.ts';
import { CliActiveRunHeartbeat } from '../../cli/src/orchestrator/active-run-heartbeat.ts';
import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';
import { testTempDir } from '../_helpers/temp.ts';

const note = 'codex, substituted for claude-code: resting until 17:40 (quota)';

const config: ResolvedConfig = {
	cli: 'codex',
	dirtyTreeThreshold: 50,
	idleNudgeTimeoutSeconds: 600,
	idleTimeoutSeconds: 900,
	maxConsecutiveTimeoutRetries: 2,
	maxIterations: 1,
	noClean: false,
	noWorkBackoffMs: 0,
	preflightDoctor: false,
	quitOnAbort: 0,
	rateLimitBackoffSeconds: 300,
	rateLimitBufferSeconds: 60,
	reasoningEffort: 'low',
	timeoutSeconds: 3600,
	web: defaultWebConfig,
};

// A direct CLI run decides its substitution before the run log and heartbeat exist; this follows
// the note from the plan to everything that outlives the console: the log, the heartbeat record,
// the Runs view of a live run, and the row the panel writes when the run ends.
describe('a direct CLI run moved by provider rest', () => {
	test('keeps its substitution in the run log, the heartbeat record and the Runs row', async () => {
		const projectDir = await testTempDir('provider-rest-direct-');
		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		await writeFile(join(projectDir, '.aidd', 'spec.md'), '# Sample\n');
		const logPath = join(projectDir, 'run.log');
		const plan = resolveRunPlan(parseArgs(['--project-dir', projectDir]), config);
		plan.backendSubstitution = note;

		const heartbeat = await CliActiveRunHeartbeat.start(plan, { logPath });
		if (!heartbeat) throw new Error('Heartbeat was not created');
		await heartbeat.dispose();

		expect(await readFile(logPath, 'utf8')).toStartWith(`Provider rest: ${note}\n`);

		const [record] = await readCliActiveRunRecords(projectDir, { includeCompleted: true });
		if (!record) throw new Error('No active-run record was written');
		expect(record.backend).toBe('codex');
		expect(record.backendSubstitution).toBe(note);
		expect(toCliRunRecord(record).backendSubstitution).toBe(note);

		const sqlite = new Database(':memory:');
		try {
			migrateWebDatabase(sqlite);
			const { commands, db } = wrapWebDatabase(sqlite);
			await commands.terminalizeRun({
				completedAt: Date.now(),
				continuationValue: 'none',
				durationMs: 1000,
				finalStatus: 'completed',
				record: { ...record, state: 'completed' },
			});
			const row = await db.select().from(runs).where(eq(runs.id, record.id)).get();
			expect(row?.backendSubstitution).toBe(note);
		} finally {
			sqlite.close();
		}
	});
});
