import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import type { PipelineSessionRecord } from '../../frontend/src/api/types.ts';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

const session: PipelineSessionRecord = {
	activeTopLevelStep: null,
	completedAt: 2_000,
	completedTopLevelSteps: 1,
	durationMs: 1_000,
	errorMessage: null,
	executionIdentities: [],
	id: 'session-1',
	parametersJson: '{}',
	parkedWorkRuns: 0,
	projectName: 'aidd',
	projectPath: 'D:/applications/aidd',
	recipeId: 'skill:feature-review',
	recipeName: 'Feature Review',
	recipeSha256: null,
	skippedTopLevelSteps: 0,
	startedAt: 1_000,
	status: 'completed',
	totalSteps: 1,
};

function renderTable(showLifecycleControls: boolean): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		"import { UnifiedExecutionTable } from './src/pages/runs/UnifiedExecutionTable.tsx';",
		`const session = ${JSON.stringify(session)};`,
		`const table = createElement(UnifiedExecutionTable, {
			continuedRunIds: new Set(), continuePendingId: undefined,
			description: 'Finished runs.', emptyMessage: 'No runs.',
			entries: [{ kind: 'pipeline', session }],
			expandedSessions: new Set(), icon: createElement('span'),
			onContinue: () => {}, onKill: () => {}, onSelectPipeline: () => {},
			onSelectRun: () => {}, onSelectStepRun: () => {}, onStop: () => {},
			onStopSession: () => {}, onToggleSession: () => {}, projectRouteIdByPath: new Map(),
			selection: undefined,
			showLifecycleControls: ${showLifecycleControls}, title: 'History'
		});`,
		'console.log(renderToStaticMarkup(createElement(MemoryRouter, null, table)));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

function columnClasses(html: string): string[] {
	return Array.from(html.matchAll(/<col class="([^"]+)"/g), (match) => match[1] ?? '');
}

describe('Runs History column budget', () => {
	test('renders shared column widths through the real execution table', () => {
		const html = renderTable(false);

		expect(columnClasses(html)).toEqual(['w-28', 'w-48', 'w-52', 'w-48', 'w-22', 'w-32']);
		expect(html).toContain('Feature Review');
		expect(html).toContain('href="/pipeline-sessions/session-1"');
	});

	test('keeps every track aligned when History omits lifecycle controls', () => {
		const active = renderTable(true);
		const history = renderTable(false);
		expect(columnClasses(active)).toEqual(columnClasses(history));
		expect(columnClasses(active).at(-1)).toBe('w-32');
		expect(active).toContain('Stop unavailable: session completed');
		expect(history).not.toContain('Stop unavailable: session completed');
	});
});
