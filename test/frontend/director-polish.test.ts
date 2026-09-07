import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

import type { DirectorSuggestionRecord } from '../../frontend/src/api/types.ts';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(FRONTEND_ROOT, 'src', ...segments)).text();
}

function renderQueue(suggestions: DirectorSuggestionRecord[], loading = false): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		"import { DirectorSuggestionsList } from './src/pages/director/DirectorSuggestions.tsx';",
		`const suggestions = ${JSON.stringify(suggestions)};`,
		'const noop = () => undefined;',
		'const list = createElement(DirectorSuggestionsList, {',
		`\tloading: ${loading},`,
		'	onDismiss: noop,',
		'	onLaunch: noop,',
		'	suggestions,',
		'});',
		'console.log(JSON.stringify(renderToStaticMarkup(createElement(MemoryRouter, null, list))));',
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

function renderRecentCycles(loading: boolean): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		"import { DirectorRecentCycles } from './src/pages/director/DirectorRecentCycles.tsx';",
		`const cycles = createElement(DirectorRecentCycles, { cycles: [], loading: ${loading}, now: 0 });`,
		'console.log(JSON.stringify(renderToStaticMarkup(createElement(MemoryRouter, null, cycles))));',
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

function suggestion(overrides: Partial<DirectorSuggestionRecord>): DirectorSuggestionRecord {
	return {
		confidence: null,
		createdAt: Date.UTC(2026, 7, 5, 12),
		cycleId: 'cycle_1',
		description: 'Resolve the audit finding recorded against the importer.',
		evidence: null,
		id: 'sug_a',
		launchedPipelineSessionId: null,
		launchedRunId: null,
		projectId: 'aidd',
		rank: null,
		reasoning: 'The audit is unresolved.',
		resolvedAt: null,
		riskLevel: 'HIGH',
		status: 'pending',
		suggestedArgs: null,
		suggestedRecipe: null,
		taskType: 'audit_remediation',
		title: 'Resolve the audit finding',
		...overrides,
	};
}

describe('Director hydration reserves its settled regions', () => {
	test('the page threads initial query loading state into every data-dependent region', async () => {
		const [activeCyclePanel, page] = await Promise.all([
			read('pages', 'director', 'ActiveCyclePanel.tsx'),
			read('pages', 'director', 'DirectorPage.tsx'),
		]);

		expect(page).toContain(
			'const cyclesLoading = director.cycles.isLoading && director.cycles.data === undefined',
		);
		expect(page).toContain('loading={director.suggestions.isLoading}');
		expect(page).toContain('loading={cyclesLoading}');
		expect(page).toContain('<ActiveCycleLoading />');
		expect(activeCyclePanel).toContain('Loading active cycle…');
	});

	test('suggestions render ten stable rows instead of the empty state while loading', () => {
		const html = renderQueue([], true);

		expect(html).toContain('Loading suggestions…');
		expect(html).not.toContain('No suggestions yet.');
		expect(html.match(/data-loading-row="suggestion"/gu)).toHaveLength(10);
		expect(html).toContain('min-h-[4.625rem]');
	});

	test('recent cycles fill the bounded scroll region instead of rendering empty while loading', () => {
		const html = renderRecentCycles(true);

		expect(html).toContain('Loading recent cycles…');
		expect(html).not.toContain('No cycles run yet.');
		expect(html.match(/data-loading-row="cycle"/gu)).toHaveLength(7);
	});
});

/**
 * The queue was a header Card followed by ten sibling full-width Cards, each carrying its own
 * rounded border and 16px of padding for one decision — eleven outlined objects and a 2503px page,
 * while `CycleRow` in the column beside it renders the same shape as compact rows inside one card.
 */
describe('the suggestion queue is a list, not a stack of cards', () => {
	test('rows are sunken blocks inside the one section Card', async () => {
		const html = renderQueue([suggestion({}), suggestion({ id: 'sug_b' })]);
		const rows = html.match(/rounded-md bg-muted p-3/gu);

		expect(rows).toHaveLength(2);
		// `CycleRow` in the adjacent column is the source of that class triple; if the two ever
		// disagree again the two halves of the page stop matching.
		const cycles = await read('pages', 'director', 'DirectorRecentCycles.tsx');
		expect(cycles).toContain('rounded-md bg-muted p-3');
	});

	test('the rows carry no Card of their own', async () => {
		const rowBlock = await read('pages', 'director', 'DirectorSuggestionRow.tsx');

		// Scoped to the row: the section still renders a `<Card>`, and that is the point.
		expect(rowBlock).not.toContain('<Card');
	});

	test('the complete narrative is disclosed instead of clamped in every row', async () => {
		const rowBlock = await read('pages', 'director', 'DirectorSuggestionRow.tsx');

		expect(rowBlock).toContain('expanded ? (');
		expect(rowBlock).toContain('<NarrativeSection title="Suggestion">');
		expect(rowBlock).toContain('<NarrativeSection title="Reasoning">');
		expect(rowBlock).not.toContain('line-clamp');
	});

	test('the row stays bounded without a private responsive breakpoint', async () => {
		const source = await read('pages', 'director', 'DirectorSuggestions.tsx');
		const row = await read('pages', 'director', 'DirectorSuggestionRow.tsx');

		// The page column now supplies the card measure, so all three operational cards share one
		// right edge. Prose and machine evidence keep their own reading measures inside each row.
		expect(source).toContain('<Card>');
		expect(source).not.toContain('max-w-[66rem]');

		expect(row).not.toContain('@min-[');
		expect(row).toContain('rounded-md bg-muted p-3');
	});
});

/** The value that varies between rows should carry more weight than the repeated task type. */
describe('the differentiating metadata carries the visual weight', () => {
	test('risk is a toned badge while the repeated task type is a quiet reading', async () => {
		const html = renderQueue([
			suggestion({ riskLevel: 'HIGH' }),
			suggestion({ id: 'sug_b', riskLevel: 'LOW' }),
		]);
		const source = await read('pages', 'director', 'DirectorSuggestionRow.tsx');

		expect(source).toContain('<TaskReading taskType={suggestion.taskType} />');
		expect(source).toContain('<Badge showDot tone={riskTone(suggestion.riskLevel)}>');
		expect(source).not.toContain('<StatusDot');
		expect(html).toContain('Audit remediation');
		expect(html).toContain('High risk');
		expect(html).toContain('Low risk');
	});

	test('every state is explicit, including the default pending state', () => {
		const pending = renderQueue([suggestion({})]);
		const launched = renderQueue([suggestion({ status: 'launched' })]);

		expect(pending).toContain('Pending');
		expect(launched).toContain('Launched');
	});
});

/**
 * The two SegmentedControls sat flush left at an 8px gap with no labels between them, so "All types"
 * beside "All risk" read as one four-segment control over one axis.
 */
describe('the filter row reads as two axes', () => {
	test('the groups are pushed apart with the readout between them', () => {
		const html = renderQueue([
			suggestion({}),
			suggestion({ id: 'sug_b', taskType: 'ci_failure' }),
		]);
		const bar =
			/<div class="mt-3 flex flex-wrap items-center justify-between gap-3">.*?<div class="mt-3 space-y-2"/su.exec(
				html,
			);

		expect(bar).not.toBeNull();
		const markup = bar?.[0] ?? '';
		const readout = markup.indexOf('role="status"');
		expect(readout).toBeGreaterThan(markup.indexOf('Filter suggestions by task type'));
		expect(readout).toBeLessThan(markup.indexOf('Filter suggestions by risk level'));
		expect(markup).toContain('Showing 2 of 2');
	});

	test('the readout denominator follows the filtered list', async () => {
		const [list, filters] = await Promise.all([
			read('pages', 'director', 'DirectorSuggestions.tsx'),
			read('pages', 'director', 'DirectorSuggestionFilters.tsx'),
		]);

		expect(list).toContain('totalCount={filteredSuggestions.length}');
		expect(filters).toContain('Showing {displayedCount} of {totalCount}');
		expect(filters).not.toContain('Showing {displayedCount} of {openSuggestions.length}');
	});
});

/**
 * The transcript's only message was a filled bubble whose author was `sr-only`: a sighted reader
 * decoded two fills, and the system role differed from the Director's own replies by fill alone.
 */
describe('a chat message says who wrote it', () => {
	test('the author label is drawn, not only announced', async () => {
		const source = await read('components', 'shared', 'ChatMessageBubble.tsx');

		expect(source).toMatch(/cn\(\s*microLabelClass/u);
		// Scoped to the rendered class list: the comment above the label map names the `sr-only`
		// treatment it replaced, and a bare substring match would find its own explanation.
		expect(source).not.toMatch(/className="[^"]*sr-only/u);
		expect(source).not.toContain("cn('sr-only");
		for (const label of ['Director', 'System', 'You']) expect(source).toContain(`'${label}'`);
	});

	test('the system note is an aside, not a filled bubble', async () => {
		const source = await read('components', 'shared', 'ChatMessageBubble.tsx');
		const roles = source.slice(
			source.indexOf('const ROLE_CLASS'),
			source.indexOf('export function ChatMessageBubble'),
		);

		// Scoped to the role map: the doc comment above it names the two fills it replaced. The
		// quote class covers both spellings — the entries are template literals now that they
		// interpolate the reading measure, and a regex pinned to `'` would pass by matching nothing.
		expect(roles).toContain('system: ');
		expect(roles).toContain('border border-dashed border-border');
		expect(roles).not.toMatch(/system: [`'][^`']*bg-/u);
	});

	test('a bubble hugs its content instead of filling the transcript', async () => {
		const source = await read('components', 'shared', 'ChatMessageBubble.tsx');
		const roles = source.slice(
			source.indexOf('const ROLE_CLASS'),
			source.indexOf('export function ChatMessageBubble'),
		);

		// Block-level divs with only a percentage cap rendered every message at exactly the cap: in
		// a 703px transcript, 38px of text came out 557px wide. All three roles hug now, and the cap
		// is the declared reading measure rather than a percentage that keeps growing with the panel.
		for (const role of ['assistant:', 'system:', 'user:']) {
			const entry = roles.slice(roles.indexOf(role));
			expect(entry.slice(0, entry.indexOf('\n'))).toContain('w-fit');
		}
		expect(roles).toContain('${proseMeasureClass}');
		expect(roles).not.toContain('max-w-[88%]');
		expect(roles).not.toContain('max-w-[82%]');
		// The user role is still the one that right-aligns; `w-fit` is what gives that any effect.
		expect(roles).toMatch(/user: `ml-auto /u);
	});
});

/**
 * The per-row Delete was the highest-chroma control in the left half of the page, repeated once per
 * chat, while the one constructive action beside it was an unlabelled ghost glyph.
 */
describe('the chat rail points at creation, not destruction', () => {
	test('delete is a ghost and New chat is labelled', async () => {
		const source = await read('pages', 'director', 'DirectorChatSection.tsx');

		expect(source).toContain('New chat');
		expect(source).toContain('<MessageSquarePlus className="h-3.5 w-3.5" />');
		expect(source).not.toContain('variant="danger"');
	});
});

/** The Suggestions count omitted the `showDot` every equivalent Dashboard header count uses. */
describe('header counts share one form', () => {
	test('the Suggestions badge carries the Dashboard dot', () => {
		const html = renderQueue([suggestion({})]);

		expect(html).toContain('1 open');
		// The `showDot` swatch is the same primitive used by the risk badge beneath it.
		expect(html).toContain(
			'<span aria-hidden="true" class="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"',
		);
	});

	test('the form is the one FeatureStatusCard renders', async () => {
		const source = await read('pages', 'director', 'DirectorSuggestions.tsx');
		const card = await read('pages', 'dashboard', 'FeatureStatusCard.tsx');

		expect(source).toContain('<Badge showDot tone=');
		expect(card).toContain('<Badge showDot tone=');
	});
});
