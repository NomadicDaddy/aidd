import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function source(relative: string): string {
	return readFileSync(join(FRONTEND_ROOT, 'src', relative), 'utf8');
}

/** Renders FilterToolbar with a primary control and one extra child. */
function renderToolbarWithSecondChild(): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { FilterToolbar } from './src/components/shared/FilterToolbar.tsx';",
		"import { PageRail } from './src/components/shared/PageRail.tsx';",
		'const toolbar = createElement(FilterToolbar, {',
		"\tcolumns: '@min-[36rem]:grid-cols-2',",
		'\tfiltered: 3,',
		'\thasFilters: false,',
		"\tnoun: 'audits',",
		'\tonReset: () => undefined,',
		'\ttotal: 8,',
		"}, createElement('input', { key: 'a', placeholder: 'Filter audits' }),",
		"createElement('span', { key: 'b' }, 'SECOND CHILD'));",
		"console.log(renderToStaticMarkup(createElement(PageRail, { rail: 'full' }, toolbar)));",
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

describe('the applicability matrix legend is reachable at every width', () => {
	test('a FilterToolbar child after the first is drawn only from 36rem up', () => {
		const markup = renderToolbarWithSecondChild();
		const gate = markup.indexOf('hidden @min-[36rem]:contents');

		// The mechanism the legend fell through, asserted rather than described: everything past
		// controls[0] goes into one width-gated wrapper, so a phone renders it at 0x0. Anything a
		// reader needs in order to decode the surface cannot live there.
		expect(gate).toBeGreaterThan(-1);
		expect(markup.match(/SECOND CHILD/gu)).toHaveLength(1);
		expect(markup.indexOf('SECOND CHILD')).toBeGreaterThan(gate);
	});

	test('each matrix presentation keeps its legend outside the toolbar and beside its data', () => {
		const tab = source('pages/audits/tabs/ApplicabilityTab.tsx');
		const toolbarEnd = tab.indexOf('</FilterToolbar>');
		const mobileLegend = tab.indexOf('<MatrixLegend />');
		const table = tab.indexOf('hidden p-0 xl:block');
		const desktopLegend = tab.indexOf('<MatrixLegend />', mobileLegend + 1);
		const cards = tab.indexOf('space-y-3 xl:hidden');

		// Each responsive presentation owns a visible key immediately before its data. Keeping the
		// desktop copy inside the table Card also makes the key part of the scrolling data surface.
		expect(toolbarEnd).toBeGreaterThan(-1);
		expect(mobileLegend).toBeGreaterThan(toolbarEnd);
		expect(table).toBeGreaterThan(mobileLegend);
		expect(desktopLegend).toBeGreaterThan(table);
		expect(cards).toBeGreaterThan(desktopLegend);
		expect(tab.slice(0, toolbarEnd)).not.toContain('MatrixLegend />');
		expect(tab.match(/<MatrixLegend \/>/gu)).toHaveLength(2);
	});
});
