import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import type { DirectorSuggestionRecord } from '../../frontend/src/api/types.ts';

import { SUGGESTION_BATCH_SIZE } from '../../frontend/src/pages/director/directorDisclosure.ts';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function suggestion(
	index = 0,
	overrides: Partial<DirectorSuggestionRecord> = {},
): DirectorSuggestionRecord {
	return {
		confidence: 0.9,
		createdAt: Date.UTC(2026, 7, 17, 12, index),
		cycleId: 'cycle_1',
		description: `Complete suggestion narrative ${index}`,
		evidence: JSON.stringify({ staleThresholdDays: 30, total: 12 + index }),
		id: `suggestion_${index}`,
		launchedPipelineSessionId: null,
		launchedRunId: null,
		projectId: 'aidd',
		rank: null,
		reasoning: `Reasoning for suggestion ${index}`,
		resolvedAt: null,
		riskLevel: 'HIGH',
		status: 'pending',
		suggestedArgs: null,
		suggestedRecipe: null,
		taskType: 'audit_remediation',
		title: `Suggestion ${index}`,
		...overrides,
	};
}

function runRender(script: string[]): string {
	const result = Bun.spawnSync([process.execPath, '-e', script.join('\n')], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout).trim()) as string;
}

function renderQueue(count: number): string {
	const suggestions = Array.from({ length: count }, (_, index) => suggestion(index));
	return runRender([
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		"import { DirectorSuggestionsList } from './src/pages/director/DirectorSuggestions.tsx';",
		`const suggestions = ${JSON.stringify(suggestions)};`,
		'const noop = () => undefined;',
		'const queue = createElement(DirectorSuggestionsList, {',
		' onDismiss: noop, onLaunch: noop, suggestions',
		'});',
		'console.log(JSON.stringify(renderToStaticMarkup(createElement(MemoryRouter, null, queue))));',
	]);
}

function renderRow(expanded: boolean, overrides: Partial<DirectorSuggestionRecord> = {}): string {
	return runRender([
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		"import { DirectorSuggestionRow } from './src/pages/director/DirectorSuggestionRow.tsx';",
		`const suggestion = ${JSON.stringify(suggestion(0, overrides))};`,
		'const noop = () => undefined;',
		`const row = createElement(DirectorSuggestionRow, { expanded: ${expanded},`,
		' onDismiss: noop, onLaunch: noop, onPreview: noop, onToggle: noop, suggestion',
		'});',
		'console.log(JSON.stringify(renderToStaticMarkup(createElement(MemoryRouter, null, row))));',
	]);
}

function renderActiveCycle(): string {
	const base = 'D:\\applications\\aidd\\.aidd\\director\\cycles\\cycle_active';
	const cycle = {
		artifacts: {
			contextExists: false,
			contextPath: `${base}\\context.json`,
			fleetSummaryExists: true,
			fleetSummaryPath: `${base}\\fleet-summary.json`,
			outputExists: false,
			outputPath: `${base}\\output.json`,
		},
		completedAt: null,
		directAiMeta: null,
		failureReason: null,
		fleetHealthScore: null,
		id: 'cycle_active',
		stage: 'writing_context',
		startedAt: Date.UTC(2026, 7, 17, 12),
		status: 'running',
		totalSuggestions: 0,
	};
	return runRender([
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { ActiveCyclePanel } from './src/pages/director/ActiveCyclePanel.tsx';",
		`const cycle = ${JSON.stringify(cycle)};`,
		'console.log(JSON.stringify(renderToStaticMarkup(createElement(ActiveCyclePanel, {',
		' cycle, now: cycle.startedAt + 10_000',
		'}))));',
	]);
}

describe('Director suggestion batching', () => {
	test('renders one compact batch on desktop instead of the complete queue', () => {
		const html = renderQueue(23);
		const headings = html.match(/<h3 class="[^"]*"[^>]*>Suggestion \d+<\/h3>/gu);

		expect(headings).toHaveLength(SUGGESTION_BATCH_SIZE);
		expect(html).toContain('Showing 10 of 23');
		expect(html).toContain('Show 10 more');
		expect(html).not.toContain('Suggestion 10</h3>');
	});
});

describe('Director suggestion review disclosure', () => {
	test('keeps identity and decision state scannable while collapsed', () => {
		const html = renderRow(false);

		expect(html).toContain('href="/projects/aidd"');
		expect(html).toContain('Audit remediation');
		expect(html).toContain('High risk');
		expect(html).toContain('Pending');
		expect(html).toContain('aria-expanded="false"');
		expect(html).toContain('Review');
		expect(html).not.toContain('Complete suggestion narrative');
		expect(html).not.toContain('aria-label="Launch suggestion:');
	});

	test('restores the full narrative and all decision actions when expanded', () => {
		const html = renderRow(true);

		expect(html).toContain('aria-expanded="true"');
		expect(html).toContain('Complete suggestion narrative 0');
		expect(html).toContain('Reasoning for suggestion 0');
		expect(html).toContain('<pre');
		expect(html).toContain('<code>');
		expect(html).toContain('font-mono');
		expect(html).toContain('&quot;staleThresholdDays&quot;: 30');
		expect(html).toContain('justify-start');
		expect(html).toContain('aria-label="Preview launch for suggestion: Suggestion 0"');
		expect(html).toContain('aria-label="Launch suggestion: Suggestion 0"');
		expect(html).toContain('aria-label="Dismiss suggestion: Suggestion 0"');
	});

	test('keeps Dismiss exclusive to pending suggestions and preserves launched output', () => {
		const pending = renderRow(true);
		const launching = renderRow(true, { status: 'launching' });
		const launched = renderRow(true, {
			launchedRunId: 'run_1',
			status: 'launched',
		});
		const dismissed = renderRow(true, { status: 'dismissed' });

		expect(pending).toContain('aria-label="Dismiss suggestion: Suggestion 0"');
		expect(launching).not.toContain('aria-label="Dismiss suggestion:');
		expect(launched).not.toContain('aria-label="Dismiss suggestion:');
		expect(dismissed).not.toContain('aria-label="Dismiss suggestion:');
		expect(launched).toContain('href="/runs?run=run_1"');
		expect(launched).toContain('View launch output');
	});
});

describe('Director suggestion actionable count', () => {
	test('counts only pending suggestions while retaining launched output rows', () => {
		const html = runRender([
			"import { createElement } from 'react';",
			"import { renderToStaticMarkup } from 'react-dom/server';",
			"import { MemoryRouter } from 'react-router';",
			"import { DirectorSuggestionsList } from './src/pages/director/DirectorSuggestions.tsx';",
			`const suggestions = ${JSON.stringify([suggestion(0), suggestion(1), suggestion(2)])};`,
			"suggestions[1].status = 'launched';",
			"suggestions[1].launchedRunId = 'run_1';",
			"suggestions[2].status = 'dismissed';",
			'const noop = () => undefined;',
			'const queue = createElement(DirectorSuggestionsList, {',
			' onDismiss: noop, onLaunch: noop, suggestions',
			'});',
			'console.log(JSON.stringify(renderToStaticMarkup(createElement(MemoryRouter, null, queue))));',
		]);

		expect(html).toContain('1 open');
		expect(html).toContain('Suggestion 1</h3>');
		expect(html).not.toContain('Suggestion 2</h3>');
	});
});

describe('Director active-cycle artifact paths', () => {
	test('keeps the full path in the tooltip while truncating the rendered display line', () => {
		const html = renderActiveCycle();

		expect(html).toContain('block truncate text-2xs text-muted-foreground');
		expect(html).not.toContain('text-2xs break-all');
		expect(html).toContain(
			'title="D:/applications/aidd/.aidd/director/cycles/cycle_active/fleet-summary.json"',
		);
		expect(html).toContain('>D:/applications/aidd/.aidd/director/cycles/cycle_active');
	});
});
