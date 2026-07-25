import { Database } from 'bun:sqlite';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { type WebDatabase, wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { runs, settings } from '../../backend/src/db/schema.ts';
import { getOutputTimeseries } from '../../backend/src/services/telemetry/outputTimeseries.ts';
import {
	backfillRunOutputMetrics,
	OUTPUT_METRICS_BACKFILL_KEY,
} from '../../backend/src/services/run/outputMetricsBackfill.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

import { testTempDir } from '../_helpers/temp.ts';
interface MetricSeed {
	cachedTokens?: null | number;
	filesChanged?: null | number;
	id: string;
	inputTokens?: null | number;
	linesAdded?: null | number;
	linesRemoved?: null | number;
	outputTokens?: null | number;
	reasoningTokens?: null | number;
	projectPath?: string;
	startedAt: number;
	status?: 'completed' | 'failed' | 'running' | 'stopped';
}

let db: WebDatabase;

function seedRun(seed: MetricSeed): Promise<unknown> {
	return db.insert(runs).values({
		backend: 'native',
		cachedTokens: seed.cachedTokens ?? null,
		filesChanged: seed.filesChanged ?? null,
		id: seed.id,
		inputTokens: seed.inputTokens ?? null,
		linesAdded: seed.linesAdded ?? null,
		linesRemoved: seed.linesRemoved ?? null,
		outputTokens: seed.outputTokens ?? null,
		reasoningTokens: seed.reasoningTokens ?? null,
		projectName: 'demo',
		projectPath: seed.projectPath ?? 'd:/applications/demo',
		source: 'web',
		startedAt: seed.startedAt,
		status: seed.status ?? 'completed',
	});
}

async function readMetrics(id: string) {
	const rows = await db
		.select({
			cachedTokens: runs.cachedTokens,
			filesChanged: runs.filesChanged,
			inputTokens: runs.inputTokens,
			linesAdded: runs.linesAdded,
			linesRemoved: runs.linesRemoved,
			outputTokens: runs.outputTokens,
			reasoningTokens: runs.reasoningTokens,
		})
		.from(runs)
		.where(eq(runs.id, id));
	return rows[0];
}

beforeEach(() => {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	db = wrapWebDatabase(sqlite).db;
});

describe('getOutputTimeseries', () => {
	test('sums metrics per bucket and tracks capture coverage separately per metric family', async () => {
		const now = Date.now();
		const hourMs = 60 * 60 * 1000;
		const recent = Math.floor(now / hourMs) * hourMs + 1; // stable inside one hour bucket
		// Two fully-captured runs, one tokens-only run (commit-less), one pre-capture run.
		await seedRun({
			filesChanged: 2,
			id: 'run_a',
			inputTokens: 1_000,
			linesAdded: 100,
			linesRemoved: 30,
			outputTokens: 200,
			reasoningTokens: 80,
			cachedTokens: 400,
			startedAt: recent,
		});
		await seedRun({
			filesChanged: 1,
			id: 'run_b',
			inputTokens: 2_000,
			linesAdded: 50,
			linesRemoved: 10,
			outputTokens: 300,
			reasoningTokens: 20,
			startedAt: recent,
		});
		await seedRun({
			id: 'run_tokens_only',
			inputTokens: 500,
			outputTokens: 50,
			startedAt: recent,
		});
		await seedRun({ id: 'run_precapture', startedAt: recent });
		// Excluded: still running, and outside the window.
		await seedRun({ id: 'run_live', inputTokens: 9_999, startedAt: recent, status: 'running' });
		await seedRun({
			id: 'run_ancient',
			inputTokens: 9_999,
			startedAt: now - 90 * 24 * hourMs,
		});

		const points = await getOutputTimeseries(db, {
			bucket: 'hour',
			windowMs: 24 * hourMs,
		});
		expect(points).toHaveLength(1);
		expect(points[0]).toEqual({
			bucket: Math.floor(recent / hourMs) * hourMs,
			cachedTokens: 400,
			filesChanged: 3,
			inputTokens: 3_500,
			linesAdded: 150,
			linesRemoved: 40,
			outputTokens: 550,
			reasoningTokens: 100,
			runs: 4,
			runsWithFileData: 2,
			runsWithLineData: 2,
			runsWithTokenData: 3,
		});
	});

	test('returns buckets sorted ascending', async () => {
		const dayMs = 24 * 60 * 60 * 1000;
		const now = Date.now();
		await seedRun({ id: 'run_new', linesAdded: 5, linesRemoved: 1, startedAt: now });
		await seedRun({
			id: 'run_old',
			linesAdded: 7,
			linesRemoved: 2,
			startedAt: now - 2 * dayMs,
		});
		const points = await getOutputTimeseries(db, { bucket: 'day', windowMs: 7 * dayMs });
		expect(points).toHaveLength(2);
		expect(points[0]!.bucket).toBeLessThan(points[1]!.bucket);
		expect(points[0]!.linesAdded).toBe(7);
		expect(points[1]!.linesAdded).toBe(5);
	});
});

function git(cwd: string, args: string[]): void {
	const result = Bun.spawnSync(
		['git', '-c', 'user.email=test@example.com', '-c', 'user.name=test', ...args],
		{ cwd, stderr: 'pipe', stdout: 'pipe', windowsHide: true },
	);
	if (result.exitCode !== 0) {
		throw new Error(`git ${args.join(' ')} failed: ${result.stderr.toString()}`);
	}
}

function gitHead(cwd: string): string {
	const result = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], {
		cwd,
		stdout: 'pipe',
		windowsHide: true,
	});
	return result.stdout.toString().trim();
}

describe('backfillRunOutputMetrics', () => {
	test('fills historical rows from the ledger, deriving lines via git when diffStat is absent', async () => {
		const projectDir = await testTempDir('aidd-backfill-');
		try {
			git(projectDir, ['init', '-q']);
			await writeFile(join(projectDir, 'sample.ts'), 'one\ntwo\nthree\n');
			git(projectDir, ['add', '.']);
			git(projectDir, ['commit', '-q', '-m', 'add sample']);
			const commitHash = gitHead(projectDir);

			await mkdir(join(projectDir, '.aidd'), { recursive: true });
			const ledgerLines = [
				'{not json',
				JSON.stringify({ summary: 'entry without runId is skipped' }),
				JSON.stringify({
					diffStat: { deletions: 4, filesChanged: 2, insertions: 10 },
					runId: 'run_ledger_full',
					totals: {
						cachedTokens: 30,
						inputTokens: 1_200,
						outputTokens: 340,
						reasoningTokens: 12,
					},
				}),
				JSON.stringify({
					commitsCreated: [{ hash: commitHash, subject: 'add sample' }],
					runId: 'run_git_derive',
					totals: { inputTokens: 800, outputTokens: 90 },
				}),
			];
			await writeFile(join(projectDir, '.aidd', 'runs.jsonl'), `${ledgerLines.join('\n')}\n`);

			const startedAt = Date.now() - 1_000;
			await seedRun({ id: 'run_ledger_full', projectPath: projectDir, startedAt });
			await seedRun({ id: 'run_git_derive', projectPath: projectDir, startedAt });
			await seedRun({ id: 'run_no_ledger', projectPath: projectDir, startedAt });

			const updated = await backfillRunOutputMetrics(db);
			expect(updated).toBe(2);

			expect(await readMetrics('run_ledger_full')).toEqual({
				cachedTokens: 30,
				filesChanged: 2,
				inputTokens: 1_200,
				linesAdded: 10,
				linesRemoved: 4,
				outputTokens: 340,
				reasoningTokens: 12,
			});
			// Lines re-derived from git numstat over the recorded commit (3-line file added).
			expect(await readMetrics('run_git_derive')).toEqual({
				cachedTokens: null,
				filesChanged: 1,
				inputTokens: 800,
				linesAdded: 3,
				linesRemoved: 0,
				outputTokens: 90,
				reasoningTokens: null,
			});
			// No ledger entry → untouched, stays NULL.
			expect(await readMetrics('run_no_ledger')).toEqual({
				cachedTokens: null,
				filesChanged: null,
				inputTokens: null,
				linesAdded: null,
				linesRemoved: null,
				outputTokens: null,
				reasoningTokens: null,
			});

			// The completion flag is written and short-circuits every later invocation.
			const flag = await db
				.select({ value: settings.value })
				.from(settings)
				.where(eq(settings.key, OUTPUT_METRICS_BACKFILL_KEY));
			expect(flag).toHaveLength(1);
			expect(JSON.parse(flag[0]!.value) as { updated: number }).toMatchObject({
				updated: 2,
			});
			await seedRun({ id: 'run_after_flag', projectPath: projectDir, startedAt });
			expect(await backfillRunOutputMetrics(db)).toBe(0);
			expect((await readMetrics('run_after_flag'))?.inputTokens).toBeNull();
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('rows already carrying tokens are not backfill candidates', async () => {
		await seedRun({
			id: 'run_new_capture',
			inputTokens: 42,
			projectPath: 'd:/applications/nonexistent',
			startedAt: Date.now(),
		});
		expect(await backfillRunOutputMetrics(db)).toBe(0);
		expect((await readMetrics('run_new_capture'))?.inputTokens).toBe(42);
	});
});
