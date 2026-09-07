import { describe, expect, test } from 'bun:test';

import type { ProjectLocalIteration, ProjectLocalRun } from '../../frontend/src/api/types.ts';

import { recentMetadataActivity } from '../../frontend/src/pages/projects/detail/recentActivityItems.ts';

function run(overrides: Partial<ProjectLocalRun> = {}): ProjectLocalRun {
	return {
		aiddDirty: null,
		aiddRevision: null,
		aiddVersion: null,
		aiSummary: null,
		artifactWarnings: [],
		backend: 'native',
		backendExitCode: null,
		commitsCreated: [
			{ hash: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', subject: 'feat: login flow' },
		],
		commitsCreatedCount: 1,
		completedFeatures: [],
		durationMs: 120_000,
		endedAt: '2026-06-10T10:02:00.000Z',
		executionMode: null,
		exitCode: 0,
		filesCreated: 1,
		filesEdited: 2,
		mode: 'directive',
		model: 'glm-5.3',
		phase: 'directive',
		provider: 'zhipu',
		reasoningEffort: null,
		residualDirtySourceFiles: [],
		residualUntrackedFeatureDirs: [],
		runId: 'run_1780973891097_c3ea39cc',
		runLedgerDirty: false,
		scopeOverrun: false,
		source: 'web',
		startedAt: '2026-06-10T10:00:00.000Z',
		stopReason: 'completed',
		summary: 'directive run finished with exit code 0',
		triumvirateRoles: null,
		unattributedDirtySourceFiles: [],
		...overrides,
	};
}

function iteration(overrides: Partial<ProjectLocalIteration> = {}): ProjectLocalIteration {
	return {
		backend: 'native',
		completedFeatures: [],
		completionMarkerIssue: null,
		durationMs: 120_000,
		endedAt: '2026-06-10T10:02:00.000Z',
		executionMode: null,
		exitCode: 0,
		finalChecks: null,
		iteration: 0,
		runId: 'run_1780973891097_c3ea39cc',
		scopeOverrun: false,
		selectedFeatures: [],
		startedAt: '2026-06-10T10:00:00.000Z',
		status: 'success',
		summary: 'directive run finished with exit code 0',
		triumvirateRoles: null,
		...overrides,
	};
}

describe('recentMetadataActivity', () => {
	test('summarizes a run with human launch, runtime, and work details', () => {
		const items = recentMetadataActivity([run()], []);

		expect(items).toHaveLength(1);
		expect(items[0]?.title).toBe('Directive run completed');
		expect(items[0]?.traceLabel).toBe('Run c3ea39cc');
		expect(items[0]?.runId).toBe('run_1780973891097_c3ea39cc');
		expect(items[0]?.detailParts).toEqual(['Web launch', '2m']);
		expect(items[0]?.summary).toBe('2 files edited, 1 file created, 1 commit');
		expect(items[0]?.executionIdentity).toEqual({
			backend: 'native',
			model: 'glm-5.3',
			provider: 'zhipu',
			reasoningEffort: null,
		});
	});

	test('carries recorded commits on run items and none on iteration items', () => {
		const items = recentMetadataActivity([run()], [iteration({ runId: null })]);

		expect(items).toHaveLength(2);
		const runItem = items.find((item) => item.id.startsWith('run:'));
		const iterationItem = items.find((item) => item.id.startsWith('iteration:'));
		expect(runItem?.commits).toEqual([
			{ hash: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', subject: 'feat: login flow' },
		]);
		expect(iterationItem?.commits).toEqual([]);
		expect(iterationItem?.runId).toBeNull();
	});

	test('does not duplicate an iteration that belongs to a represented run', () => {
		const items = recentMetadataActivity([run()], [iteration()]);

		expect(items).toHaveLength(1);
		expect(items[0]?.id).toBe('run:run_1780973891097_c3ea39cc');
	});

	test('includes iteration activity when no run row represents it', () => {
		const items = recentMetadataActivity(
			[],
			[
				iteration({
					completedFeatures: ['feature-a'],
					finalChecks: { smokeQc: 'passed' },
					runId: null,
				}),
			],
		);

		expect(items).toHaveLength(1);
		expect(items[0]?.title).toBe('Native iteration succeeded');
		expect(items[0]?.summary).toBe('1 feature touched, smoke:qc passed');
		// The shared derivation normalizes an absent field to null rather than undefined, which is
		// what lets the same value cross the wire to the dashboard unchanged.
		expect(items[0]?.executionIdentity).toEqual({
			backend: 'native',
			model: null,
			provider: null,
			reasoningEffort: null,
		});
		expect(items[0]?.traceLabel).toBe('Iteration 0');
	});

	test('prefers aiSummary over mechanical count parts in run detail', () => {
		const items = recentMetadataActivity(
			[run({ aiSummary: 'Implemented the login flow with error handling.' })],
			[],
		);

		expect(items).toHaveLength(1);
		expect(items[0]?.summary).toBe('Implemented the login flow with error handling.');
		expect(items[0]?.detailParts).not.toContain(
			'Implemented the login flow with error handling.',
		);
	});

	test('falls back to mechanical summary when aiSummary is absent', () => {
		const items = recentMetadataActivity([run()], []);

		expect(items).toHaveLength(1);
		expect(items[0]?.summary).toBe('2 files edited, 1 file created, 1 commit');
	});

	test('falls back to mechanical summary when aiSummary is null', () => {
		const items = recentMetadataActivity([run({ aiSummary: null })], []);

		expect(items).toHaveLength(1);
		expect(items[0]?.summary).toBe('2 files edited, 1 file created, 1 commit');
	});
});
