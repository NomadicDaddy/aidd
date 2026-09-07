import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import { FILTER_FIELD_ORDER } from '../../frontend/src/lib/filterFields.ts';

const frontendRoot = resolve(import.meta.dir, '../../frontend');

/**
 * The sentence a surface writes when a filter emptied it.
 *
 * Deliberately matched by its shape rather than by a list of known strings: a new surface that says
 * `No widgets match the current filters.` is caught the day it is written, which is the only moment
 * the wiring is cheap to add. The character class stops the match at the first brace, angle bracket
 * or quote so an interpolated expression cannot swallow the rest of the file.
 */
const FILTERED_TO_NOTHING = /No [^<>{}'"`]*match(?:es)? (?:the|those|these)[^<>{}'"`]*/gu;

/**
 * The one sanctioned way a filtered-to-nothing sentence may sit outside an `EmptyState`: passed to a
 * component that renders it through one. Each entry names the prop and the carrier, and the carrier
 * is checked below — a hop is only allowed because someone verified the far end.
 */
const PROP_HOPS = [
	{
		carrier: 'pages/runs/UnifiedExecutionTable.tsx',
		prop: 'emptyMessage',
		source: 'pages/runs/RunsPage.tsx',
	},
];

interface Sentence {
	file: string;
	hasRegister: boolean;
	inEmptyState: boolean;
	line: string;
	text: string;
}

/**
 * Source with comments removed.
 *
 * A census that scans raw text reports its own documentation: the comment above a surface's empty
 * state names the sentence it renders, and the guard then flags the explanation as the defect.
 */
function stripComments(raw: string): string {
	return raw
		.replaceAll(/\{\/\*[\s\S]*?\*\/\}/gu, '')
		.replaceAll(/\/\*[\s\S]*?\*\//gu, '')
		.replaceAll(/\/\/.*/gu, '');
}

async function census(): Promise<Sentence[]> {
	const found: Sentence[] = [];
	for await (const relative of new Bun.Glob('src/**/*.tsx').scan({ cwd: frontendRoot })) {
		const file = relative.replaceAll('\\', '/').replace(/^src\//u, '');
		const text = stripComments(await Bun.file(resolve(frontendRoot, relative)).text());
		for (const match of text.matchAll(FILTERED_TO_NOTHING)) {
			const before = text.slice(0, match.index);
			// The nearest tag is not the containing tag: a `<p>` child, or an element passed as an
			// `action=` prop, both resolve to the wrong one. Balance the open against the close.
			const open = before.lastIndexOf('<EmptyState');
			const inEmptyState = open > before.lastIndexOf('</EmptyState>');
			found.push({
				file,
				// From the open tag to the sentence itself, not to the first `>` — a nested element in
				// a prop closes the tag early and hides the register that follows it.
				hasRegister: inEmptyState && text.slice(open, match.index).includes('filters='),
				inEmptyState,
				line: text.slice(before.lastIndexOf('\n') + 1, match.index),
				text: match[0],
			});
		}
	}
	return found;
}

function renderStates(): Record<string, string> {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmptyState } from './src/components/shared/EmptyState.tsx';

const render = (props) =>
	renderToStaticMarkup(createElement(EmptyState, props, 'No widgets match the current filters.'));
const register = (inForce) => ({ inForce, onReset: () => {} });

console.log(
	JSON.stringify({
		bare: render({}),
		toolbarOwned: render({
			filterReset: 'toolbar',
			filters: register([{ label: 'Search', value: 'auth' }]),
		}),
		outOfOrder: render({
			filters: register([
				{ label: 'Source', value: 'Local' },
				{ label: 'Search', value: 'auth' },
				{ label: 'Status', value: 'Running' },
			]),
		}),
		unknownLabel: render({
			filters: register([
				{ label: 'Risk', value: 'High' },
				{ label: 'Search', value: 'auth' },
			]),
		}),
	}),
);
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: frontendRoot,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout)) as Record<string, string>;
}

describe('empty state register', () => {
	test('every filtered-to-nothing sentence is rendered by the house component', async () => {
		const sentences = await census();

		// A census that matched nothing would pass every assertion below it. The corpus stood at 18
		// when this guard was written; the floor is deliberately lower than that so ordinary edits do
		// not redden it, and high enough that a regex that stopped working cannot slip through.
		expect(sentences.length).toBeGreaterThanOrEqual(15);

		const stray = sentences.filter(
			(sentence) =>
				!sentence.inEmptyState &&
				!PROP_HOPS.some(
					(hop) => hop.source === sentence.file && sentence.line.includes(`${hop.prop}=`),
				),
		);
		expect(stray.map((sentence) => `${sentence.file}: ${sentence.text.trim()}`)).toEqual([]);
	});

	test('every contained sentence names the filters that emptied it', async () => {
		const sentences = await census();
		const unregistered = sentences.filter(
			(sentence) => sentence.inEmptyState && !sentence.hasRegister,
		);
		expect(unregistered.map((sentence) => `${sentence.file}: ${sentence.text.trim()}`)).toEqual(
			[],
		);
	});

	test('a prop hop lands on a carrier that renders the register too', async () => {
		for (const hop of PROP_HOPS) {
			const source = await Bun.file(resolve(frontendRoot, 'src', hop.source)).text();
			const carrier = await Bun.file(resolve(frontendRoot, 'src', hop.carrier)).text();

			// The message travels with a register or the hop launders an unregistered empty state
			// through a component that looks compliant.
			expect(source).toContain('emptyFilters={');
			expect(carrier).toContain(
				'<EmptyState filterReset="toolbar" filters={props.emptyFilters}>',
			);
		}
	});

	test('the register decides whether the state offers to clear anything', () => {
		const markup = renderStates();

		// Absence is not a filter. A surface with nothing in it has nothing to reset, and offering
		// the control there teaches readers the button does not work.
		expect(markup.bare).not.toContain('In force:');
		expect(markup.bare).not.toContain('Reset filters');

		expect(markup.outOfOrder).toContain('In force:');
		expect(markup.outOfOrder).toContain('Reset filters');
		expect(markup.toolbarOwned).toContain('<span>Search</span>');
		expect(markup.toolbarOwned).toContain('>auth</code>');
		expect(markup.toolbarOwned).not.toContain('Reset filters');
	});

	test('nearby toolbars own the sole reset on catalog empty states', async () => {
		const recipes = await Bun.file(
			resolve(frontendRoot, 'src/pages/recipes/RecipesPage.tsx'),
		).text();
		const audits = await Bun.file(
			resolve(frontendRoot, 'src/pages/audits/tabs/CatalogTable.tsx'),
		).text();
		const projects = await Bun.file(
			resolve(frontendRoot, 'src/pages/projects/ProjectsResults.tsx'),
		).text();

		expect(recipes).toContain('filterReset="toolbar"');
		expect(audits).toContain('filterReset="toolbar"');
		expect(projects).toContain('filterReset="toolbar"');
	});

	test('the readout follows the toolbar, not the order the register was built in', () => {
		const markup = renderStates();
		const outOfOrder = markup.outOfOrder!;
		const unknownLabel = markup.unknownLabel!;

		// Supplied Source, Search, Status; read back in the sequence the controls sit in.
		const search = outOfOrder.indexOf('<span>Search</span>');
		const status = outOfOrder.indexOf('<span>Status</span>');
		const source = outOfOrder.indexOf('<span>Source</span>');
		expect(search).toBeGreaterThan(-1);
		expect(status).toBeGreaterThan(search);
		expect(source).toBeGreaterThan(status);
		expect(outOfOrder).toContain('>auth</code>');
		expect(outOfOrder).toContain('>Running</code>');
		expect(outOfOrder).toContain('>Local</code>');

		// A label the shared order does not know sorts last, which is where such controls sit —
		// Signal, Window and Risk are each their own surface's axis and are absent by design.
		expect(FILTER_FIELD_ORDER as readonly string[]).not.toContain('Risk');
		expect(unknownLabel.indexOf('<span>Risk</span>')).toBeGreaterThan(
			unknownLabel.indexOf('<span>Search</span>'),
		);
		expect(unknownLabel).toContain('>High</code>');
	});

	test('a query that has not resolved cannot be reported as an empty result', async () => {
		const source = await Bun.file(
			resolve(frontendRoot, 'src/pages/scheduled/ScheduledPage.tsx'),
		).text();

		const loading = source.indexOf('scheduled.tasks.isLoading ? (');
		const claim = source.indexOf('<EmptyState');
		expect(loading).toBeGreaterThan(-1);
		expect(claim).toBeGreaterThan(loading);
	});
});
