import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

import type { DirectorSuggestionRecord } from '../../frontend/src/api/types.ts';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(FRONTEND_ROOT, 'src', ...segments)).text();
}

function renderQueue(suggestions: DirectorSuggestionRecord[]): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		"import { DirectorSuggestionsList } from './src/pages/director/DirectorSuggestions.tsx';",
		`const suggestions = ${JSON.stringify(suggestions)};`,
		'const noop = () => undefined;',
		'const list = createElement(DirectorSuggestionsList, {',
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
		const source = await read('pages', 'director', 'DirectorSuggestions.tsx');
		const rowBlock = source.slice(
			source.indexOf('function SuggestionRow'),
			source.indexOf('export function DirectorSuggestionsList'),
		);

		// Scoped to the row: the section still renders a `<Card>`, and that is the point.
		expect(rowBlock).not.toContain('<Card');
	});

	test('the blurb fills the row rather than leaving a void beside it', async () => {
		const source = await read('pages', 'director', 'DirectorSuggestions.tsx');
		const rowBlock = source.slice(
			source.indexOf('function SuggestionRow'),
			source.indexOf('export function DirectorSuggestionsList'),
		);

		// The right column is anchored to the row's far edge on purpose — 31 rows of Launch and
		// Dismiss line up in one column the pointer runs down. A reading measure on the blurb under
		// a right-anchored column does not narrow the row, it moves the empty space inside it:
		// measured at 2250x1309 the text stopped at x=427 and the badges began at x=1632, so every
		// row carried 1205px of nothing between the thing described and the button acting on it.
		const blurb = rowBlock.slice(rowBlock.indexOf('line-clamp-2'));
		expect(blurb.slice(0, blurb.indexOf('>'))).not.toContain('proseMeasureClass');
		expect(rowBlock).toContain('min-w-0 @min-[61rem]:flex-1');

		// The fleet-wide note keeps its measure. That one is two sentences of guidance to read, not
		// a clamped title to scan, so the cap is doing the job it exists for.
		expect(rowBlock).toContain(`text-xs text-muted-foreground \${proseMeasureClass}`);
	});

	test('the row is bounded so the gutter is, and the two-column gate still clears', async () => {
		const source = await read('pages', 'director', 'DirectorSuggestions.tsx');
		const artifact = await read('pages', 'projects', 'detail', 'ArtifactInventoryRow.tsx');
		const artifacts = await read('pages', 'projects', 'detail', 'ArtifactsTab.tsx');

		// `justify-between` hands everything left over to the space between the two columns, so on a
		// full-width section the row tracked the page: measured at 2250x1309 unbounded, the
		// description ended at x=839 and the actions began at x=1925. Bounding the row bounds the
		// gutter. `ArtifactInventoryRow` is the sibling this borrows from, and the two have to stay
		// recognisably one treatment.
		// On the Card, so its border ends where the rows do — DocsPage caps the doc card and not the
		// prose inside it for the same reason. `ArtifactInventoryRow` is the sibling treatment; it
		// now puts that width on its containing inventory Card for the same chrome-alignment rule.
		expect(source).toContain('<Card className="max-w-[66rem]">');
		expect(artifacts).toContain('<Card className="@container max-w-[61rem]">');
		expect(artifact).not.toContain('max-w-[61rem]');

		// The number is arithmetic. The row's two-column shape gates on `@min-[61rem]` of the row's
		// own content box, so the row needs 976 + 24 of its `p-3` and the Card needs that plus 32 of
		// its `p-4` — 1032px, or 64.5rem. Below that every row falls back to the stacked form this
		// shape exists to replace, silently and at every width.
		expect(source).toContain('@min-[61rem]:flex-row');
		expect(source).toContain('rounded-md bg-muted p-3');
	});
});

/**
 * Every generated batch is uniform, so a filled red "High risk" pill appeared on 10 of 10 rows: the
 * only red on the surface, differentiating nothing, next to a "Pending" badge restating the state
 * that every row in a queue is in by definition.
 */
describe('red means something is wrong', () => {
	test('risk is a toned dot beside muted text, not a filled badge', () => {
		const html = renderQueue([
			suggestion({ riskLevel: 'HIGH' }),
			suggestion({ id: 'sug_b', riskLevel: 'LOW' }),
		]);

		// 1.5, not the 2 this started at: the dot is `ui/badge`'s `StatusDot` now, so the risk
		// reading cannot drift from the size the Suggestions count badge renders beside it.
		expect(html).toContain('h-1.5 w-1.5 shrink-0 rounded-full bg-red-500');
		expect(html).toContain('h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500');
		expect(html).toContain('High risk');
		// The badge treatment is what was retired: `toneBadge.red` is a red field on a rounded-md
		// pill, so no rendered element may carry both.
		expect(html).not.toMatch(/class="[^"]*rounded-md[^"]*bg-red-/u);
		expect(html).not.toMatch(/class="[^"]*bg-red-[^"]*rounded-md/u);
	});

	test('the default status is unbadged and a departure from it is not', () => {
		const pending = renderQueue([suggestion({})]);
		const launched = renderQueue([suggestion({ status: 'launched' })]);

		expect(pending).not.toContain('Pending');
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
});

/**
 * The transcript's only message was a filled bubble whose author was `sr-only`: a sighted reader
 * decoded two fills, and the system role differed from the Director's own replies by fill alone.
 */
describe('a chat message says who wrote it', () => {
	test('the author label is drawn, not only announced', async () => {
		const source = await read('components', 'shared', 'ChatMessageBubble.tsx');

		expect(source).toContain('cn(microLabelClass');
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
		// The `showDot` swatch — the same `StatusDot` the risk reading beneath it renders, which
		// is what makes this assertion and the one in `red means something is wrong` agree.
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
