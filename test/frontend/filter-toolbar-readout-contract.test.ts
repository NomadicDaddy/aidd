import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const frontendRoot = resolve(import.meta.dir, '../../frontend');

interface ReadoutMarkup {
	active: string;
	disabled: string;
	readoutOnly: string;
	withAction: string;
}

function renderReadouts(): ReadoutMarkup {
	const script = `
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FilterToolbarReadout } from './src/components/shared/FilterToolbarReadout.tsx';

const render = (props) => renderToStaticMarkup(createElement(FilterToolbarReadout, props));
console.log(JSON.stringify({
	active: render({ filtered: 2, hasFilters: true, noun: 'runs', onReset: () => {}, total: 8 }),
	withAction: render({
		actions: createElement('button', { type: 'button' }, 'Sort by'),
		filtered: 2,
		hasFilters: true,
		noun: 'projects',
		onReset: () => {},
		total: 8,
	}),
	disabled: render({ filtered: 8, hasFilters: false, noun: 'runs', onReset: () => {}, total: 8 }),
	readoutOnly: render({ filtered: 6, noun: 'projects', total: 12 }),
}));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: frontendRoot,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout).trim()) as ReadoutMarkup;
}

describe('filter toolbar readout boundary', () => {
	test('keeps one status and one stable reset without tooltip-only tab stops', () => {
		const markup = renderReadouts();

		for (const state of [markup.active, markup.disabled]) {
			expect(state.match(/role="status"/gu)).toHaveLength(1);
			expect(state.match(/<button/gu)).toHaveLength(1);
			expect(state).toContain('Reset filters');
			expect(state).not.toContain('title=');
			expect(state).not.toContain('tabindex=');
			expect(state).not.toContain('relative inline-flex max-w-full min-w-0');
		}
		expect(markup.disabled).toContain('disabled=""');
		expect(markup.active).not.toContain('disabled=""');
	});

	test('keeps actions ahead of one trailing count and reset unit', () => {
		const { withAction } = renderReadouts();
		const actionIndex = withAction.indexOf('Sort by');
		const readoutIndex = withAction.indexOf('Showing 2 of 8 projects');
		const resetIndex = withAction.indexOf('Reset filters');

		expect(withAction).toContain('data-slot="filter-toolbar-trailing"');
		expect(withAction).toContain('data-slot="readout-reset"');
		expect(actionIndex).toBeLessThan(readoutIndex);
		expect(readoutIndex).toBeLessThan(resetIndex);
	});

	test('supports shared count-only readouts without inventing reset actions', () => {
		const { readoutOnly } = renderReadouts();

		expect(readoutOnly).toContain('Showing 6 of 12 projects');
		expect(readoutOnly.match(/role="status"/gu)).toHaveLength(1);
		expect(readoutOnly).not.toContain('<button');
		expect(readoutOnly).not.toContain('Reset filters');
	});
});
