import { describe, expect, test } from 'bun:test';
import type { ProjectLocalIteration, ProjectLocalRun } from '../../frontend/src/api/types.ts';
import { resolve } from 'node:path';
import {
	categorizeRun,
	classifyIteration,
	classifyRun,
	classifyRunWithWarnings,
	iterationFinalCheckFailures,
	runFinalCheckFailures,
} from '../../frontend/src/components/shared/local-aidd-history/outcome.ts';

function makeIteration(
	overrides: { status: string } & Partial<ProjectLocalIteration>,
): ProjectLocalIteration {
	return {
		backend: 'codex',
		completedFeatures: [],
		completionMarkerIssue: null,
		durationMs: 1000,
		endedAt: '2026-06-05T20:55:34.190Z',
		exitCode: 0,
		executionMode: null,
		finalChecks: null,
		iteration: 1,
		runId: 'run_1780692239413_646f05b3',
		scopeOverrun: false,
		selectedFeatures: [],
		startedAt: '2026-06-05T20:43:59.878Z',
		summary: null,
		triumvirateRoles: null,
		...overrides,
	};
}

function makeRun(overrides: Partial<ProjectLocalRun> = {}): ProjectLocalRun {
	return {
		aiddDirty: null,
		aiddRevision: null,
		aiddVersion: null,
		aiSummary: null,
		artifactWarnings: [],
		backend: 'codex',
		backendExitCode: null,
		commitsCreated: [],
		commitsCreatedCount: 1,
		completedFeatures: ['scenario-comparison'],
		durationMs: 694312,
		endedAt: '2026-06-05T20:55:34.190Z',
		exitCode: 0,
		executionMode: null,
		filesCreated: 0,
		filesEdited: 0,
		mode: 'directive',
		phase: 'directive',
		model: 'gpt-5.6',
		provider: null,
		reasoningEffort: 'high',
		residualDirtySourceFiles: [],
		residualUntrackedFeatureDirs: [],
		runId: 'run_1780692239413_646f05b3',
		runLedgerDirty: false,
		scopeOverrun: false,
		source: null,
		startedAt: '2026-06-05T20:43:59.878Z',
		stopReason: 'completed',
		summary: 'directive run finished with exit code 0',
		triumvirateRoles: null,
		unattributedDirtySourceFiles: [],
		...overrides,
	};
}

function renderRunBadges(run: ProjectLocalRun): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { LocalRunResultBadges } from './src/components/shared/local-aidd-history/LocalRunResultBadges.tsx';",
		`const run = ${JSON.stringify(run)};`,
		'console.log(renderToStaticMarkup(createElement(LocalRunResultBadges, { run, runIterations: [] })));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

describe('final-check failure surfacing (ISS-001)', () => {
	test('iterationFinalCheckFailures lists only failed checks', () => {
		expect(iterationFinalCheckFailures(null)).toEqual([]);
		expect(iterationFinalCheckFailures({ smokeQc: 'passed' })).toEqual([]);
		expect(iterationFinalCheckFailures({ smokeQc: 'failed', typecheck: 'passed' })).toEqual([
			'smokeQc',
		]);
	});

	test('a successful iteration with a failed final check is flagged as a warning, not clean success', () => {
		// Regression for the margin-planner iteration 022 reconciliation: outcome.status='success',
		// exitCode=0, but finalChecks.smokeQc='failed'. The raw success must not be reported as an
		// unqualified emerald "Success".
		const iteration = makeIteration({ finalChecks: { smokeQc: 'failed' }, status: 'success' });
		const outcome = classifyIteration(iteration);
		expect(outcome.tone).toBe('amber');
		expect(outcome.label).toBe('Success · check failed');
		expect(outcome.title).toContain('smoke:qc');
	});

	test('a successful iteration with no failed checks stays clean success', () => {
		const outcome = classifyIteration(makeIteration({ status: 'success' }));
		expect(outcome.tone).toBe('emerald');
		expect(outcome.label).toBe('Success');
	});

	test('a provider content-flag refusal classifies as a red failing outcome', () => {
		const outcome = classifyIteration(makeIteration({ status: 'provider_flagged' }));
		expect(outcome.tone).toBe('red');
		expect(outcome.label).toBe('Provider flagged');
	});

	test('runFinalCheckFailures aggregates failures across a run iterations', () => {
		const iterations = [
			makeIteration({ finalChecks: { smokeQc: 'failed' }, status: 'success' }),
			makeIteration({
				finalChecks: { typecheck: 'failed' },
				iteration: 2,
				status: 'success',
			}),
			makeIteration({ iteration: 3, status: 'success' }),
		];
		expect(runFinalCheckFailures(iterations).sort()).toEqual(['smokeQc', 'typecheck']);
	});

	test('a completed/exit-0 run with a failed iteration final check categorizes as Warnings', () => {
		const run = makeRun();
		// classifyRun alone still reports the raw ledger fact (completed/exit 0 → Success).
		expect(classifyRun(run).tone).toBe('emerald');
		// With its iterations, categorization downgrades to Warnings so it is not filtered as Success.
		const failingIterations = [
			makeIteration({ finalChecks: { smokeQc: 'failed' }, status: 'success' }),
		];
		expect(categorizeRun(run, failingIterations)).toBe('Warnings');
		expect(categorizeRun(run, [makeIteration({ status: 'success' })])).toBe('Success');
	});
});

describe('run-level warning downgrade (ISS-003)', () => {
	test('classifyRunWithWarnings downgrades to amber when iteration final checks fail', () => {
		const run = makeRun();
		const iterations = [
			makeIteration({ finalChecks: { smokeQc: 'failed' }, status: 'success' }),
		];
		const outcome = classifyRunWithWarnings(run, iterations);
		expect(outcome.tone).toBe('amber');
		expect(outcome.label).toBe('Success · warnings');
	});

	test('classifyRunWithWarnings stays emerald when no warnings', () => {
		const run = makeRun();
		const iterations = [makeIteration({ status: 'success' })];
		const outcome = classifyRunWithWarnings(run, iterations);
		expect(outcome.tone).toBe('emerald');
		expect(outcome.label).toBe('Success');
	});

	test('classifyRunWithWarnings does NOT downgrade for runLedgerDirty alone', () => {
		// Ledger dirt is informational (the teal "Ledger out of sync" badge): it usually
		// reflects pre-existing operator dirt, and pre-fix ledger entries had it
		// unconditionally true — downgrading made the amber badge meaningless.
		const run = makeRun({ runLedgerDirty: true });
		const iterations = [makeIteration({ status: 'success' })];
		const outcome = classifyRunWithWarnings(run, iterations);
		expect(outcome.tone).toBe('emerald');
		expect(outcome.label).toBe('Success');
	});

	test('classifyRunWithWarnings downgrades to amber when the run left uncommitted source files', () => {
		// Regression for run-end-dirty-tree-check: residualDirtySourceFiles carries only dirt the
		// run itself introduced (dirty at run end, not at run start), so unlike runLedgerDirty it
		// must taint the outcome.
		const run = makeRun({ residualDirtySourceFiles: ['src/app.ts', 'src/lib/util.ts'] });
		const iterations = [makeIteration({ status: 'success' })];
		const outcome = classifyRunWithWarnings(run, iterations);
		expect(outcome.tone).toBe('amber');
		expect(outcome.label).toBe('Success · warnings');
		expect(categorizeRun(run, [])).toBe('Warnings');
	});

	test('unattributed concurrent dirt stays successful and renders its own informational badge', () => {
		const run = makeRun({ unattributedDirtySourceFiles: ['src/operator.ts'] });
		const outcome = classifyRunWithWarnings(run, []);
		expect(outcome.tone).toBe('emerald');
		expect(outcome.label).toBe('Success');
		expect(categorizeRun(run, [])).toBe('Success');
		const markup = renderRunBadges(run);
		expect(markup).toContain('Concurrent source changes');
		expect(markup).not.toContain('Uncommitted source');
	});

	test('a stale backend response without the new field still renders run badges', () => {
		const run = makeRun();
		delete (run as { unattributedDirtySourceFiles?: string[] }).unattributedDirtySourceFiles;
		const markup = renderRunBadges(run);
		expect(markup).toContain('Success');
		expect(markup).not.toContain('Concurrent source changes');
	});

	test('classifyRunWithWarnings downgrades to amber when residualUntrackedFeatureDirs exist', () => {
		const run = makeRun({ residualUntrackedFeatureDirs: ['some-feature-dir'] });
		const iterations = [makeIteration({ status: 'success' })];
		const outcome = classifyRunWithWarnings(run, iterations);
		expect(outcome.tone).toBe('amber');
		expect(outcome.label).toBe('Success · warnings');
	});

	test('classifyRunWithWarnings does not downgrade non-emerald outcomes', () => {
		const run = makeRun({ stopReason: 'exit_error', exitCode: 1 });
		const iterations = [makeIteration({ status: 'success' })];
		const outcome = classifyRunWithWarnings(run, iterations);
		expect(outcome.tone).toBe('red');
	});

	test('categorizeRun keeps ledger-dirty runs as Success', () => {
		const run = makeRun({ runLedgerDirty: true });
		expect(categorizeRun(run, [])).toBe('Success');
	});

	test('categorizeRun categorizes untracked-artifact runs as Warnings', () => {
		const run = makeRun({ residualUntrackedFeatureDirs: ['leftover-dir'] });
		expect(categorizeRun(run, [])).toBe('Warnings');
	});

	test('roadmap-gate blocks classify red for current (blocked) and historical (no_work) runs', () => {
		const current = makeRun({
			stopReason: 'blocked',
			summary:
				'Roadmap gate blocked coding: 1 feature(s) are missing roadmap milestone assignments (unmapped: github-pages-site)',
		});
		const historical = makeRun({
			stopReason: 'no_work',
			summary:
				'Roadmap gate blocked coding: 3 feature(s) are missing roadmap milestone assignments',
		});
		for (const run of [current, historical]) {
			const outcome = classifyRun(run);
			expect(outcome.label).toBe('Blocked: roadmap');
			expect(outcome.tone).toBe('red');
			expect(categorizeRun(run, [])).toBe('Blocked');
		}
		// A plain empty-backlog no_work stays neutral.
		const plain = classifyRun(
			makeRun({ stopReason: 'no_work', summary: 'no incomplete feature work' }),
		);
		expect(plain.label).toBe('No work');
		expect(plain.tone).toBe('neutral');
	});
});
