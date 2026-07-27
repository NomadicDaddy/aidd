import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { sessionStatusLabel } from '../../frontend/src/pages/runs/pipelineSessionStatus.ts';

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
			expect(source).toContain('label={`Show ${run.projectName} run in Live Console`}');
			expect(source).toContain('selected={selected}');
			expect(source).toContain('<ProjectDetailLink');
			expect(source).toContain('<Badge tone="neutral">Run</Badge>');
			expect(source).not.toContain('tabIndex={0}');
			expect(source).not.toContain('onKeyDown=');
		}
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
		expect(table.match(/selectedRunId=/g)).toHaveLength(2);
		expect(steps).toContain("aria-current={selected ? 'true' : undefined}");
		expect(steps).toContain('aria-pressed={selected}');
		expect(steps).toContain('md:grid-cols-[22fr_11fr_9fr_20fr_17fr_9fr_12fr]');
	});

	test('pipeline status labels match run-row title casing', () => {
		expect(sessionStatusLabel('running')).toBe('Running');
		expect(sessionStatusLabel('completed')).toBe('Completed');
		expect(sessionStatusLabel('completed_with_failures')).toBe('Completed with failures');
	});
});
