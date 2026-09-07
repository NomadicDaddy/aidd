import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { ProjectLocalIteration } from '../../frontend/src/api/types.ts';

import { runFinalCheckResults } from '../../frontend/src/components/shared/local-aidd-history/finalChecks.ts';
import { runFinalCheckFailures } from '../../frontend/src/components/shared/local-aidd-history/outcome.ts';
import { resolveRunFinalCheckState } from '../../frontend/src/pages/runs/runFinalCheckState.ts';

const FRONTEND = resolve(import.meta.dir, '../../frontend');

function iteration(
	runId: null | string,
	finalChecks: ProjectLocalIteration['finalChecks'],
): ProjectLocalIteration {
	return {
		backend: null,
		completedFeatures: [],
		completionMarkerIssue: null,
		durationMs: null,
		endedAt: null,
		executionMode: null,
		exitCode: 0,
		finalChecks,
		iteration: 1,
		runId,
		scopeOverrun: false,
		selectedFeatures: [],
		startedAt: null,
		status: 'success',
		summary: null,
		triumvirateRoles: null,
	};
}

interface RenderedPanels {
	checksMetadataError: string;
	cliPassed: string;
	directorFailed: string;
	loading: string;
	unmatched: string;
	webNoChecks: string;
}

/**
 * Renders the real RunDetailPanel against a primed project-detail cache, one entry per state the
 * panel can reach here, plus the final-checks presenter on its own for the one it cannot.
 *
 * React Query masks a query's error during a static render — an errored query reports `pending`
 * to the observer so the client can retry on hydration — and this repo has no DOM test
 * environment to mount into. So the failed-request state is rendered through RunFinalChecks
 * directly, and the wiring that reaches it is covered by resolveRunFinalCheckState plus the
 * source assertion below.
 */
function renderPanels(): RenderedPanels {
	const script = String.raw`
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { RunDetailPanel } from './src/pages/runs/RunDetailPanel.tsx';
import { RunFinalChecks } from './src/pages/runs/RunFinalChecks.tsx';

const client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
const iteration = (runId, finalChecks) => ({
	backend: null, completedFeatures: [], completionMarkerIssue: null, durationMs: null,
	endedAt: null, executionMode: null, exitCode: 0, finalChecks, iteration: 1, runId,
	scopeOverrun: false, selectedFeatures: [], startedAt: null, status: 'success', summary: null,
	triumvirateRoles: null,
});
const detail = (localIterations) => ({ metadata: { localIterations } });
const run = (id, projectId, source) => ({
	activityState: null, aiddDirty: null, aiddRevision: null, aiddVersion: null, aiSummary: null,
	backend: 'claude-code', canKill: false, canReadOutput: false, canStop: false,
	chainedFromRunId: null, completedAt: 2000, continuationReason: null, driverId: null,
	driverKind: null, driverSha256: null, durationMs: 1000, errorMessage: null, exitCode: 0,
	heartbeatAt: null, id, initiator: null, launchCommand: null, logPath: null, mode: 'coding',
	model: null, pid: null, pipelineSessionId: null, projectId, projectName: 'aidd',
	projectPath: 'D:/applications/aidd', provider: null, reasoningEffort: null, source,
	startedAt: 1000, status: 'completed', stopReason: 'completed', stopRequested: false,
	summary: null,
});

client.setQueryData(['project', 'p-cli'], detail([iteration('run-cli', { smokeQc: 'passed', typecheck: 'passed' })]));
client.setQueryData(['project', 'p-director'], detail([iteration('run-director', { build: 'passed', smokeQc: 'failed' })]));
client.setQueryData(['project', 'p-web'], detail([iteration('run-web', null)]));
client.setQueryData(['project', 'p-unmatched'], detail([iteration('some-other-run', { smokeQc: 'passed' })]));

const render = (element) =>
	renderToStaticMarkup(h(QueryClientProvider, { client }, h(MemoryRouter, null, element)));
const panel = (id, projectId, source) =>
	render(h(RunDetailPanel, { selectedRun: run(id, projectId, source), stopDetail: null }));

console.log(JSON.stringify({
	checksMetadataError: render(h(RunFinalChecks, { state: { kind: 'metadata-error' } })),
	cliPassed: panel('run-cli', 'p-cli', 'cli'),
	directorFailed: panel('run-director', 'p-director', 'director'),
	loading: panel('run-loading', 'p-loading', 'web'),
	unmatched: panel('run-unmatched', 'p-unmatched', 'cli'),
	webNoChecks: panel('run-web', 'p-web', 'web'),
}));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout)) as RenderedPanels;
}

describe('run final-check results', () => {
	test('reports every recorded check in one fixed order', () => {
		const results = runFinalCheckResults([
			iteration('run-1', { build: 'passed', format: 'passed', smokeQc: 'passed' }),
		]);

		expect(results.map((result) => result.label)).toEqual(['smoke:qc', 'build', 'format']);
	});

	test('a failure in any iteration is the run answer for that check', () => {
		const iterations = [
			iteration('run-1', { smokeQc: 'failed' }),
			iteration('run-1', { smokeQc: 'passed', typecheck: 'passed' }),
		];

		expect(runFinalCheckResults(iterations)).toEqual([
			{ label: 'smoke:qc', name: 'smokeQc', status: 'failed' },
			{ label: 'typecheck', name: 'typecheck', status: 'passed' },
		]);
		// The History badge and the detail listing read the same source, so they cannot disagree.
		expect(runFinalCheckFailures(iterations)).toEqual(['smokeQc']);
	});
});

describe('resolveRunFinalCheckState', () => {
	test('distinguishes loading, a failed metadata request, and an unmatched run', () => {
		const iterations = [iteration('other-run', { smokeQc: 'passed' })];

		expect(
			resolveRunFinalCheckState({ isError: false, iterations: undefined, runId: 'run-1' }),
		).toEqual({ kind: 'loading' });
		// An error outranks the absent data it caused; this must not read as "no checks".
		expect(
			resolveRunFinalCheckState({ isError: true, iterations: undefined, runId: 'run-1' }),
		).toEqual({ kind: 'metadata-error' });
		expect(resolveRunFinalCheckState({ isError: false, iterations, runId: 'run-1' })).toEqual({
			kind: 'unmatched',
		});
	});

	test('a matched iteration with no recorded checks is its own state', () => {
		expect(
			resolveRunFinalCheckState({
				isError: false,
				iterations: [iteration('run-1', null), iteration('run-1', {})],
				runId: 'run-1',
			}),
		).toEqual({ kind: 'no-checks' });
	});

	test('matches on run id alone and reports only the matched iterations', () => {
		const matched = iteration('run-1', { smokeQc: 'failed' });
		const state = resolveRunFinalCheckState({
			isError: false,
			iterations: [iteration('other-run', { build: 'failed' }), matched],
			runId: 'run-1',
		});

		expect(state).toEqual({ iterations: [matched], kind: 'checks' });
	});
});

describe('RunDetailPanel final checks and source', () => {
	const panels = renderPanels();

	test('renders the row source label for CLI, Director and Web runs', () => {
		expect(panels.cliPassed).toContain('>Source</dt>');
		expect(panels.cliPassed).toContain('>CLI</dd>');
		expect(panels.directorFailed).toContain('>Director</dd>');
		expect(panels.webNoChecks).toContain('>Web</dd>');
	});

	test('lists passed checks with their shared labels', () => {
		expect(panels.cliPassed).toContain('>Final checks</dt>');
		expect(panels.cliPassed).toContain('smoke:qc passed');
		expect(panels.cliPassed).toContain('typecheck passed');
	});

	test('reports a failed check on a run the exit code calls clean', () => {
		// The fixture run exits 0 with stopReason 'completed'. Nothing but the ledger entry says
		// smoke:qc failed, which is the whole point of reading it.
		expect(panels.directorFailed).toContain('Exit 0');
		expect(panels.directorFailed).toContain('smoke:qc failed');
		expect(panels.directorFailed).toContain('build passed');
	});

	test('tells apart no checks, no ledger entry, a failed request, and loading', () => {
		expect(panels.webNoChecks).toContain('No final checks were recorded for this run.');
		expect(panels.unmatched).toContain('local iteration ledger');
		expect(panels.loading).toContain('Reading project history');
		expect(panels.checksMetadataError).toContain('Project history could not be read');
		// Each state says only its own sentence: a run with no ledger entry must not read as a
		// run whose gate simply recorded nothing.
		expect(panels.unmatched).not.toContain('No final checks were recorded');
		expect(panels.webNoChecks).not.toContain('local iteration ledger');
		expect(panels.webNoChecks).not.toContain('Reading project history');
	});

	test('reads the failed-request state from the project query, not from the run', async () => {
		// The one state a static render cannot reach: React Query reports an errored query as
		// pending outside the browser. This is the wiring that produces it.
		const source = await readFile(join(FRONTEND, 'src/pages/runs/RunDetailPanel.tsx'), 'utf8');

		expect(source).toContain('const project = useProject(selectedRun.projectId);');
		expect(source).toContain('isError: project.isError');
		expect(source).toContain('iterations: project.data?.metadata.localIterations');
		expect(source).toContain('runId: selectedRun.id');
	});
});

describe('the final-check presenter has one home', () => {
	test('both surfaces render checks through FinalCheckBadges', async () => {
		const badges = await readFile(
			join(FRONTEND, 'src/components/shared/local-aidd-history/LocalRunResultBadges.tsx'),
			'utf8',
		);
		const checks = await readFile(join(FRONTEND, 'src/pages/runs/RunFinalChecks.tsx'), 'utf8');

		expect(badges).toContain('<FinalCheckFailureBadge iterations={runIterations} />');
		// The label composition the History row used to inline lives in the shared module now.
		expect(badges).not.toContain('finalCheckLabel');
		expect(checks).toContain('FinalCheckResultBadges');
	});
});
