import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import type { DirectorSuggestionRecord } from '../../frontend/src/api/types.ts';

import {
	compactChatSessions,
	initialSuggestionDisclosureState,
	MOBILE_SUGGESTION_BATCH_SIZE,
	suggestionDisclosureReducer,
} from '../../frontend/src/pages/director/directorDisclosure.ts';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function suggestion(index: number): DirectorSuggestionRecord {
	return {
		confidence: null,
		createdAt: Date.UTC(2026, 7, 11, 12, index),
		cycleId: 'cycle_1',
		description: `Suggestion ${index} description`,
		evidence: null,
		id: `suggestion_${index}`,
		launchedPipelineSessionId: null,
		launchedRunId: null,
		projectId: 'aidd',
		reasoning: `Suggestion ${index} reasoning`,
		resolvedAt: null,
		riskLevel: index % 2 === 0 ? 'HIGH' : 'LOW',
		status: 'pending',
		suggestedArgs: null,
		suggestedRecipe: null,
		taskType: index % 2 === 0 ? 'audit_remediation' : 'feature_completion',
		title: `Suggestion ${index}`,
	};
}

function renderMobileQueue(count: number): string {
	const suggestions = Array.from({ length: count }, (_, index) => suggestion(index));
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		"import { DirectorSuggestionsList } from './src/pages/director/DirectorSuggestions.tsx';",
		`const suggestions = ${JSON.stringify(suggestions)};`,
		'const noop = () => undefined;',
		'const queue = createElement(DirectorSuggestionsList, {',
		' isMobileLayout: true, onDismiss: noop, onLaunch: noop, suggestions',
		'});',
		'console.log(JSON.stringify(renderToStaticMarkup(createElement(MemoryRouter, null, queue))));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout).trim()) as string;
}

describe('Director mobile chat disclosure', () => {
	test('keeps the selected chat and two recent sessions in the compact rail', () => {
		const sessions = Array.from({ length: 6 }, (_, index) => ({ id: `chat_${index}` }));

		expect(compactChatSessions(sessions, 'chat_5').map((session) => session.id)).toEqual([
			'chat_0',
			'chat_1',
			'chat_5',
		]);
	});
});

describe('Director mobile suggestion disclosure', () => {
	test('renders one initial batch with the count and labelled disclosure', () => {
		const html = renderMobileQueue(12);

		expect(
			html.match(/<h3 class="text-sm font-semibold text-foreground">Suggestion /gu),
		).toHaveLength(MOBILE_SUGGESTION_BATCH_SIZE);
		expect(html).toContain('Showing 10 of 12');
		expect(html).toContain('Show more');
		expect(html).toContain('aria-controls="director-suggestion-items"');
	});

	test('resets the batch when either filter changes', () => {
		const expanded = suggestionDisclosureReducer(initialSuggestionDisclosureState, {
			total: 52,
			type: 'show-more',
		});
		expect(expanded.visibleCount).toBe(20);

		const taskFiltered = suggestionDisclosureReducer(expanded, {
			filter: 'feature_completion',
			type: 'set-task-filter',
		});
		expect(taskFiltered.visibleCount).toBe(MOBILE_SUGGESTION_BATCH_SIZE);
		expect(taskFiltered.taskFilter).toBe('feature_completion');

		const riskFiltered = suggestionDisclosureReducer(expanded, {
			filter: 'HIGH',
			type: 'set-risk-filter',
		});
		expect(riskFiltered.visibleCount).toBe(MOBILE_SUGGESTION_BATCH_SIZE);
		expect(riskFiltered.riskFilter).toBe('HIGH');
	});
});
