import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { sessionStatusLabel } from '../../frontend/src/pages/runs/pipelineSessionStatus.ts';
import {
	consoleSelectionLabel,
	runSourceLabel,
} from '../../frontend/src/pages/runs/runRowUtils.ts';

const EXECUTION_CONTAINERS = [
	'ActiveRunRow.tsx',
	'ActiveRunMobileCard.tsx',
	'PipelineSessionRow.tsx',
];

const FRONTEND_SRC = join(import.meta.dir, '..', '..', 'frontend', 'src');

async function readRunSource(file: string): Promise<string> {
	return readFile(join(FRONTEND_SRC, 'pages', 'runs', file), 'utf8');
}

function renderPipelineRow(): string {
	const session = {
		completedAt: 1_000,
		currentStepIndex: 1,
		durationMs: 1_000,
		errorMessage: null,
		executionIdentities: [],
		id: 'session-1',
		parametersJson: '{}',
		projectName: 'Project One',
		projectPath: 'd:/applications/project-one',
		recipeId: 'recipe-1',
		recipeName: 'Review Features',
		startedAt: 0,
		status: 'completed',
		totalSteps: 2,
	};
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		"import { PipelineSessionRow } from './src/pages/runs/PipelineSessionRow.tsx';",
		`const session = ${JSON.stringify(session)};`,
		"const row = createElement(PipelineSessionRow, { expanded: false, now: 1000, onSelect: () => {}, onStop: () => {}, onToggle: () => {}, projectRouteId: 'project-route', selected: false, session });",
		"const table = createElement('table', null, createElement('tbody', null, row));",
		'console.log(renderToStaticMarkup(createElement(MemoryRouter, null, table)));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) {
		throw new Error(new TextDecoder().decode(result.stderr));
	}
	return new TextDecoder().decode(result.stdout).trim();
}

describe('Runs row consistency', () => {
	test('pipeline Name selects Console while Project and Report keep explicit destinations', () => {
		const html = renderPipelineRow();

		expect(html).toMatch(
			/<button[^>]+aria-label="Show Review Features pipeline in Live Console"[^>]+aria-pressed="false"/,
		);
		expect(html).toContain('href="/projects/project-route"');
		expect(html).toContain('href="/pipeline-sessions/session-1"');
		expect(html.match(/href="\/pipeline-sessions\/session-1"/g)).toHaveLength(1);
		expect(html).toContain('>Pipeline</span>');
		expect(html).toContain('>Completed</span>');
	});

	test('run rows use the same Name, Project, and Kind contract on desktop and mobile', async () => {
		for (const file of ['ActiveRunRow.tsx', 'ActiveRunMobileCard.tsx']) {
			const source = await readRunSource(file);
			expect(source).toContain('<ConsoleSelectionButton');
			expect(source).toContain('label={consoleSelectionLabel(run)}');
			expect(source).toContain('selected={selected}');
			expect(source).toContain('<ProjectDetailLink');
			expect(source).toContain('<Badge tone="neutral">Run</Badge>');
			expect(source).not.toContain('tabIndex={0}');
			expect(source).not.toContain('onKeyDown=');
		}
	});

	test('execution containers select on pointer click without becoming keyboard controls', async () => {
		const utils = await readRunSource('runRowUtils.ts');

		// The guard is what keeps the row a convenience target rather than a rival control:
		// clicks on a nested link or button belong to that control.
		expect(utils).toContain("closest('a,button')");
		expect(utils).toContain('export function containerSelectionHandler');

		for (const file of EXECUTION_CONTAINERS) {
			const source = await readRunSource(file);
			expect(source).toContain('onClick={containerSelectionHandler(');
			expect(source).toContain('containerSelectableClass');
			// Pointer-only: no second tab stop, no synthesised Enter/Space on the container.
			expect(source).not.toContain('tabIndex={0}');
			expect(source).not.toContain('onKeyDown=');
		}
	});

	test('console selection label contains the visible button text', () => {
		// WCAG 2.5.3 Label in Name: the button renders the run mode, so the accessible name has
		// to carry that same word for speech input to reach it.
		expect(consoleSelectionLabel({ mode: 'coding', projectName: 'Project One' })).toBe(
			'Show coding for Project One in Live Console',
		);
		expect(consoleSelectionLabel({ mode: null, projectName: 'Project One' })).toBe(
			'Show Run for Project One in Live Console',
		);
	});

	test('execution selection uses a pressed native button with visible keyboard focus', async () => {
		const links = await readRunSource('ExecutionRowLinks.tsx');
		const pipelines = await readRunSource('PipelineSessionRow.tsx');

		expect(links).toContain('<button');
		expect(links).toContain('aria-pressed={selected}');
		expect(links).toContain('focus-visible:ring-2');
		expect(pipelines).toContain('selected={selected}');
		expect(pipelines).not.toContain('tabIndex={0}');
		expect(pipelines).not.toContain('onKeyDown=');
	});

	test('Active and History share fixed columns and selected pipeline steps stay visible', async () => {
		const table = await readRunSource('UnifiedExecutionTable.tsx');
		const steps = await readRunSource('PipelineStepSubRows.tsx');

		expect(table).toContain('table-fixed');
		expect(table).toContain('<colgroup>');
		expect(table).toContain('w-[22%]');
		expect(table).toContain('Kind');
		// Both surfaces render the same `stepSubRows` helper, so the selected step run stays
		// highlighted in the table and in the mobile list from one declaration.
		expect(table).toMatch(/const stepSubRows = [\s\S]*?selectedRunId=/);
		expect(table.match(/stepSubRows\(entry\)/g)).toHaveLength(2);
		expect(steps).toContain("aria-current={selected ? 'true' : undefined}");
		expect(steps).toContain('aria-pressed={selected}');
		expect(steps).toContain('xl:grid-cols-[22fr_11fr_9fr_20fr_17fr_9fr_12fr]');
	});

	test('run origin labels use the current Director name from one shared helper', async () => {
		// "Coordinator" was renamed to Director; three surfaces carried drifted copies of this
		// mapping ('Coordinator' here, abbreviated 'Coord' on the dashboard and project tab), so
		// the rename missed two of them. One helper, and a check that nobody re-inlines it.
		expect(runSourceLabel({ source: 'director' })).toBe('Director');
		expect(runSourceLabel({ source: 'cli' })).toBe('CLI');
		expect(runSourceLabel({ source: 'web' })).toBe('Web');

		const surfaces = await Promise.all([
			readRunSource('ActiveRunRow.tsx'),
			readRunSource('ActiveRunMobileCard.tsx'),
			readFile(join(FRONTEND_SRC, 'pages', 'dashboard', 'ActiveRunsCard.tsx'), 'utf8'),
			readFile(join(FRONTEND_SRC, 'pages', 'projects', 'detail', 'RunsTab.tsx'), 'utf8'),
		]);
		for (const source of surfaces) {
			expect(source).toContain('runSourceLabel(run)');
			expect(source).not.toMatch(/Coordinator|'Coord'/);
		}
	});

	test('pipeline status labels match run-row title casing', () => {
		expect(sessionStatusLabel('running')).toBe('Running');
		expect(sessionStatusLabel('completed')).toBe('Completed');
		expect(sessionStatusLabel('completed_with_failures')).toBe('Completed with failures');
	});
});
