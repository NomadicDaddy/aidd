import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import {
	gatherLocalIterations,
	gatherLocalRuns,
	gatherRunLedgerMetadata,
} from '../../backend/src/services/projectMetadata.ts';
import {
	excludeOrphanIterations,
	gatherLedgerRunIds,
	projectUsageFromLedgerEntries,
	reconcileIterationLiveness,
} from '../../backend/src/services/projectMetadata/iterationLogHelpers.ts';
import type { ProjectLocalIterationDto } from '../../backend/src/types.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

import { testTempDir } from '../_helpers/temp.ts';
function makeIteration(
	overrides: { status: string } & Partial<ProjectLocalIterationDto>,
): ProjectLocalIterationDto {
	return {
		backend: null,
		completedFeatures: [],
		completionMarkerIssue: null,
		durationMs: null,
		endedAt: null,
		exitCode: null,
		executionMode: null,
		finalChecks: null,
		iteration: 1,
		runId: null,
		scopeOverrun: false,
		selectedFeatures: [],
		startedAt: new Date(Date.UTC(2026, 0, 1)).toISOString(),
		summary: null,
		triumvirateRoles: null,
		...overrides,
	};
}

describe('project metadata', () => {
	test('aggregates lifetime tokens, reported cost, execution targets, and run modes', () => {
		const usage = projectUsageFromLedgerEntries([
			{
				backend: 'native',
				mode: 'coding',
				model: 'glm-5.2',
				provider: 'zhipu',
				runId: 'run-native',
				totals: {
					cachedTokens: 50,
					costUsd: 0,
					inputTokens: 100,
					outputTokens: 20,
					reasoningTokens: 5,
				},
			},
			{
				backend: 'claude-code',
				mode: 'audit',
				model: 'claude-fable-5',
				runId: 'run-claude',
				totals: { costUsd: 0, inputTokens: 0, outputTokens: 0 },
			},
			{
				backend: null,
				mode: null,
				model: null,
				totals: { costUsd: 0, inputTokens: 10, outputTokens: 0 },
			},
			{
				backend: 'claude-code',
				mode: 'audit',
				model: 'claude-fable-5',
				runId: 'run-claude',
				totals: { costUsd: 2.5, inputTokens: 40, outputTokens: 10 },
			},
		]);

		expect(usage.totals).toEqual({
			cachedTokens: 50,
			inputTokens: 150,
			outputTokens: 30,
			reasoningTokens: 5,
			reportedCostUsd: 2.5,
			runCount: 3,
			runsWithReportedCost: 1,
			runsWithTokenUsage: 3,
			totalTokens: 180,
		});
		expect(usage.byExecutionTarget).toHaveLength(3);
		expect(usage.byExecutionTarget[0]).toMatchObject({
			backend: 'native',
			model: 'glm-5.2',
			provider: 'zhipu',
			totalTokens: 120,
		});
		expect(usage.byMode.map((row) => row.mode)).toEqual(['coding', 'audit', null]);
		expect(usage.byMode[1]).toMatchObject({ reportedCostUsd: 2.5, runCount: 1 });
	});

	test('aggregates input and output tokens into seven UTC calendar-day buckets', () => {
		const usage = projectUsageFromLedgerEntries(
			[
				{
					endedAt: '2026-07-24T23:59:59.000Z',
					totals: { inputTokens: 10, outputTokens: 5 },
				},
				{
					endedAt: '2026-07-25T08:00:00.000Z',
					runId: 'retried-run',
					totals: { inputTokens: 90, outputTokens: 9 },
				},
				{
					endedAt: '2026-07-27T08:00:00.000Z',
					runId: 'retried-run',
					totals: { inputTokens: 18, outputTokens: 2 },
				},
				{
					endedAt: 'invalid',
					startedAt: '2026-07-28T02:00:00.000Z',
					totals: { inputTokens: 7, outputTokens: 3 },
				},
				{
					endedAt: '2026-07-29T18:00:00.000Z',
					totals: { inputTokens: 5, outputTokens: 2 },
				},
				{
					endedAt: '2026-07-22T23:59:59.000Z',
					totals: { inputTokens: 1_000, outputTokens: 1_000 },
				},
				{
					endedAt: '2026-07-30T00:00:00.000Z',
					totals: { inputTokens: 1_000, outputTokens: 1_000 },
				},
			],
			new Date('2026-07-29T20:00:00.000Z'),
		);

		expect(usage.recentDailyTokens).toEqual([
			{ date: '2026-07-23', totalTokens: 0 },
			{ date: '2026-07-24', totalTokens: 15 },
			{ date: '2026-07-25', totalTokens: 0 },
			{ date: '2026-07-26', totalTokens: 0 },
			{ date: '2026-07-27', totalTokens: 20 },
			{ date: '2026-07-28', totalTokens: 10 },
			{ date: '2026-07-29', totalTokens: 7 },
		]);
	});

	test('uses the full ledger for usage while keeping recent run rows bounded', async () => {
		const tmpDir = await testTempDir('aidd-project-usage-ledger-');
		try {
			const metadataDir = join(tmpDir, '.aidd');
			await mkdir(metadataDir, { recursive: true });
			const entries = Array.from({ length: 25 }, (_, index) => ({
				backend: 'native',
				mode: 'coding',
				model: 'glm-5.2',
				runId: `run-${index}`,
				startedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
				totals: { costUsd: 0, inputTokens: 10, outputTokens: 1 },
			}));
			await writeFile(
				join(metadataDir, 'runs.jsonl'),
				`${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
			);

			const ledger = await gatherRunLedgerMetadata(metadataDir);

			expect(ledger.localRuns).toHaveLength(20);
			expect(ledger.runIds.size).toBe(25);
			expect(ledger.usage.totals).toMatchObject({
				runCount: 25,
				runsWithTokenUsage: 25,
				totalTokens: 275,
			});
		} finally {
			await removeTempTree(tmpDir);
		}
	});

	test('gatherLocalIterations reads the newest numbered iteration artifacts', async () => {
		const tmpDir = await testTempDir('aidd-project-metadata-');
		try {
			const metadataDir = join(tmpDir, '.aidd');
			const iterationsDir = join(metadataDir, 'iterations');
			await mkdir(iterationsDir, { recursive: true });
			for (let index = 1; index <= 60; index++) {
				await writeFile(
					join(iterationsDir, `${String(index).padStart(3, '0')}.json`),
					`${JSON.stringify({
						exitCode: 0,
						iteration: index,
						outcome: { status: 'success' },
						startedAt: new Date(Date.UTC(2026, 0, index)).toISOString(),
					})}\n`,
				);
			}

			const iterations = await gatherLocalIterations(metadataDir);

			expect(iterations).toHaveLength(20);
			expect(iterations[0]?.iteration).toBe(60);
			expect(iterations.at(-1)?.iteration).toBe(41);
		} finally {
			await rm(tmpDir, { force: true, recursive: true });
		}
	});

	// The project overview's "Recent activity" card is fed by metadata.localRuns/localIterations,
	// which gatherLocalRuns/gatherLocalIterations read from a single project's own .aidd/runs.jsonl
	// and .aidd/iterations/ directory. That per-directory read IS the project scoping — there is no
	// path filter to fall back on — so a regression that ever pointed either reader at a shared or
	// wrong directory would surface another app's runs on this project's page. Reported via aidd web
	// (remediation-20260702-recent-activity-shown-here-not-filtered): "the recent activity shown here
	// is not filtered to the specific app, i'm seeing other runs". This locks the guarantee that
	// reading project A's metadata dir never surfaces project B's runs or iterations.
	test('gatherLocalRuns/gatherLocalIterations surface only the queried project, never a sibling', async () => {
		const tmpDir = await testTempDir('aidd-project-scope-');
		try {
			const projectAMeta = join(tmpDir, 'projA', '.aidd');
			const projectBMeta = join(tmpDir, 'projB', '.aidd');
			await mkdir(join(projectAMeta, 'iterations'), { recursive: true });
			await mkdir(join(projectBMeta, 'iterations'), { recursive: true });

			await writeFile(
				join(projectAMeta, 'runs.jsonl'),
				`${JSON.stringify({
					exitCode: 0,
					runId: 'cli_projA_run',
					startedAt: '2026-07-02T10:00:00.000Z',
				})}\n`,
			);
			await writeFile(
				join(projectBMeta, 'runs.jsonl'),
				`${JSON.stringify({
					exitCode: 0,
					runId: 'cli_projB_run',
					startedAt: '2026-07-02T11:00:00.000Z',
				})}\n`,
			);
			await writeFile(
				join(projectAMeta, 'iterations', '001.json'),
				`${JSON.stringify({
					exitCode: 0,
					iteration: 1,
					outcome: { status: 'success' },
					runId: 'cli_projA_run',
					startedAt: '2026-07-02T10:00:00.000Z',
				})}\n`,
			);
			await writeFile(
				join(projectBMeta, 'iterations', '001.json'),
				`${JSON.stringify({
					exitCode: 0,
					iteration: 1,
					outcome: { status: 'success' },
					runId: 'cli_projB_run',
					startedAt: '2026-07-02T11:00:00.000Z',
				})}\n`,
			);

			const runs = await gatherLocalRuns(projectAMeta);
			const iterations = await gatherLocalIterations(projectAMeta);

			expect(runs.map((run) => run.runId)).toEqual(['cli_projA_run']);
			expect(iterations.map((iteration) => iteration.runId)).toEqual(['cli_projA_run']);
		} finally {
			await removeTempTree(tmpDir);
		}
	});

	test('lifts failed finalChecks off a completed iteration that still reports success', async () => {
		// Regression for ISS-001: margin-planner run_1780692239413_646f05b3 iteration 022 recorded
		// outcome.status='success'/exitCode=0 while detailsSummary.finalChecks.smokeQc='failed'. The
		// parsed DTO must carry the failed final check so the UI can flag it instead of reporting a
		// clean, unqualified success.
		const tmpDir = await testTempDir('aidd-project-metadata-final-checks-');
		try {
			const metadataDir = join(tmpDir, '.aidd');
			const iterationsDir = join(metadataDir, 'iterations');
			await mkdir(iterationsDir, { recursive: true });
			await writeFile(
				join(iterationsDir, '022.json'),
				`${JSON.stringify({
					detailsSummary: {
						finalChecks: { smokeQc: 'failed' },
						hasLintErrors: true,
						hasTypeErrors: true,
					},
					exitCode: 0,
					iteration: 22,
					mode: 'directive',
					outcome: { exitCode: 0, status: 'success' },
					runId: 'run_1780692239413_646f05b3',
					startedAt: new Date(Date.UTC(2026, 5, 5)).toISOString(),
				})}\n`,
			);

			const iterations = await gatherLocalIterations(metadataDir);

			expect(iterations).toHaveLength(1);
			expect(iterations[0]?.status).toBe('success');
			expect(iterations[0]?.exitCode).toBe(0);
			expect(iterations[0]?.finalChecks).toEqual({ smokeQc: 'failed' });
		} finally {
			await rm(tmpDir, { force: true, recursive: true });
		}
	});

	test('records null finalChecks when an iteration recorded none', async () => {
		const tmpDir = await testTempDir('aidd-project-metadata-no-final-checks-');
		try {
			const metadataDir = join(tmpDir, '.aidd');
			const iterationsDir = join(metadataDir, 'iterations');
			await mkdir(iterationsDir, { recursive: true });
			await writeFile(
				join(iterationsDir, '001.json'),
				`${JSON.stringify({
					exitCode: 0,
					iteration: 1,
					outcome: { status: 'success' },
					startedAt: new Date(Date.UTC(2026, 5, 5)).toISOString(),
				})}\n`,
			);

			const iterations = await gatherLocalIterations(metadataDir);

			expect(iterations[0]?.finalChecks).toBeNull();
		} finally {
			await rm(tmpDir, { force: true, recursive: true });
		}
	});

	test('reports a started-but-unfinalized iteration as running, not unknown', async () => {
		const tmpDir = await testTempDir('aidd-project-metadata-running-');
		try {
			const metadataDir = join(tmpDir, '.aidd');
			const iterationsDir = join(metadataDir, 'iterations');
			await mkdir(iterationsDir, { recursive: true });
			// The orchestrator writes this 'started' artifact before the run finalizes and before
			// any runs.jsonl ledger line exists: no terminal outcome.status/exitCode, endedAt:null.
			await writeFile(
				join(iterationsDir, '001.json'),
				`${JSON.stringify({
					durationMs: 0,
					endedAt: null,
					exitCode: null,
					iteration: 1,
					lifecycle: 'started',
					runId: 'run-in-progress',
					startedAt: new Date(Date.UTC(2026, 0, 1)).toISOString(),
				})}\n`,
			);

			const iterations = await gatherLocalIterations(metadataDir);

			expect(iterations).toHaveLength(1);
			expect(iterations[0]?.status).toBe('running');
		} finally {
			await rm(tmpDir, { force: true, recursive: true });
		}
	});

	describe('reconcileIterationLiveness', () => {
		test('keeps a running iteration whose run has a live active-runs record', () => {
			const iteration = makeIteration({ runId: 'run-live', status: 'running' });
			const [reconciled] = reconcileIterationLiveness([iteration], new Set(['run-live']));
			expect(reconciled?.status).toBe('running');
		});

		test('reconciles a running iteration with no live record to terminal failed', () => {
			const iteration = makeIteration({ runId: 'run-dead', status: 'running' });
			const [reconciled] = reconcileIterationLiveness([iteration], new Set());
			expect(reconciled?.status).toBe('failed');
		});

		test('reconciles a running iteration with no runId to terminal failed', () => {
			const iteration = makeIteration({ runId: null, status: 'running' });
			const [reconciled] = reconcileIterationLiveness([iteration], new Set(['run-live']));
			expect(reconciled?.status).toBe('failed');
		});

		test('leaves already-terminal iterations untouched', () => {
			const success = makeIteration({ runId: 'run-done', status: 'success' });
			const [reconciled] = reconcileIterationLiveness([success], new Set());
			expect(reconciled?.status).toBe('success');
		});
	});

	describe('gatherLedgerRunIds', () => {
		test('collects every runId from the ledger and skips malformed lines', async () => {
			const tmpDir = await testTempDir('aidd-ledger-runids-');
			try {
				const metadataDir = join(tmpDir, '.aidd');
				await mkdir(metadataDir, { recursive: true });
				await writeFile(
					join(metadataDir, 'runs.jsonl'),
					`${JSON.stringify({ runId: 'run-a', startedAt: '2026-01-01T00:00:00.000Z' })}\n` +
						'not-json\n' +
						`${JSON.stringify({ runId: 'run-b', startedAt: '2026-01-02T00:00:00.000Z' })}\n`,
				);

				const runIds = await gatherLedgerRunIds(metadataDir);

				expect([...runIds].sort()).toEqual(['run-a', 'run-b']);
			} finally {
				await rm(tmpDir, { force: true, recursive: true });
			}
		});

		test('returns an empty set when the ledger is absent', async () => {
			const tmpDir = await testTempDir('aidd-ledger-missing-');
			try {
				const runIds = await gatherLedgerRunIds(join(tmpDir, '.aidd'));
				expect(runIds.size).toBe(0);
			} finally {
				await rm(tmpDir, { force: true, recursive: true });
			}
		});
	});

	describe('excludeOrphanIterations', () => {
		test('drops an iteration whose runId is absent from the ledger and not live', () => {
			// run_1780602522871_c2de07a9 (iterations 018/019) is absent from runs.jsonl and has no
			// active-runs record, so it must not surface as an "Unassigned iterations" phantom row.
			const orphan = makeIteration({ runId: 'run-orphan', status: 'failed' });
			const result = excludeOrphanIterations([orphan], new Set(), new Set());
			expect(result).toHaveLength(0);
		});

		test('keeps an iteration whose runId appears in the ledger', () => {
			const finalized = makeIteration({ runId: 'run-ledger', status: 'success' });
			const result = excludeOrphanIterations([finalized], new Set(['run-ledger']), new Set());
			expect(result).toHaveLength(1);
		});

		test('keeps a running iteration whose run is still live', () => {
			const live = makeIteration({ runId: 'run-live', status: 'running' });
			const result = excludeOrphanIterations([live], new Set(), new Set(['run-live']));
			expect(result).toHaveLength(1);
		});

		test('leaves an iteration with no runId untouched for window matching', () => {
			const noRunId = makeIteration({ runId: null, status: 'failed' });
			const result = excludeOrphanIterations([noRunId], new Set(), new Set());
			expect(result).toHaveLength(1);
		});
	});
});
