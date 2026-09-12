import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import { visibleProjects } from '../../frontend/src/lib/projectVisibility.ts';

/**
 * Renders the rail and returns the markup of one destination row, so a badge assertion is made
 * against the anchor it belongs to rather than against the whole nav.
 */
function renderDestination(
	href: string,
	props: { activeExecutionCount: number; collapsed: boolean; projectCount: null | number },
): string {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { SidebarNav } from './src/components/layout/SidebarNav.tsx';

const view = createElement(
	MemoryRouter,
	{ initialEntries: ['/'] },
	createElement(SidebarNav, ${JSON.stringify(props)}),
);
console.log(renderToStaticMarkup(view));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	const markup = new TextDecoder().decode(result.stdout);
	const rows = markup.split('<a ').slice(1);
	const row = rows.find((chunk) => chunk.includes(`href="${href}"`));
	if (row === undefined) throw new Error(`no destination rendered for ${href}`);
	return row.slice(0, row.indexOf('</a>'));
}

describe('sidebar count badges', () => {
	test('counts the projects the projects page shows, not the ones discovery returns', () => {
		// The template checkout is discovered like any other project and hidden by setting. A
		// badge counting the raw list reads one higher than the page it points at.
		const discovered = [
			{ name: 'aidd' },
			{ isSpernakitTemplate: true, name: 'spernakit' },
			{ name: 'quorumail' },
		];

		expect(visibleProjects(discovered, false)).toHaveLength(2);
		expect(visibleProjects(discovered, true)).toHaveLength(3);
	});

	test('pins an inventory count to the Projects row in the neutral tone', () => {
		const row = renderDestination('/projects', {
			activeExecutionCount: 0,
			collapsed: false,
			projectCount: 39,
		});

		expect(row).toContain('>39</span>');
		expect(row).toContain('39 discovered projects');
		// Neutral, not the amber the Runs badge uses: Projects counts inventory, Runs counts
		// live work.
		expect(row).toContain('bg-muted text-foreground ring-border');
		expect(row).not.toContain('bg-amber-50');
	});

	test('keeps the live-execution count amber on the Runs row', () => {
		const row = renderDestination('/runs', {
			activeExecutionCount: 2,
			collapsed: false,
			projectCount: 39,
		});

		expect(row).toContain('>2</span>');
		expect(row).toContain('2 active executions');
		expect(row).toContain('bg-amber-50');
	});

	test('renders no projects badge before the count has loaded or when the fleet is empty', () => {
		for (const projectCount of [null, 0]) {
			const row = renderDestination('/projects', {
				activeExecutionCount: 0,
				collapsed: false,
				projectCount,
			});

			expect(row).not.toContain('discovered project');
			expect(row).not.toContain('bg-muted text-foreground ring-border');
		}
	});

	test('drops both badges in the collapsed rail, where the row is an icon', () => {
		const projects = renderDestination('/projects', {
			activeExecutionCount: 2,
			collapsed: true,
			projectCount: 39,
		});
		const runs = renderDestination('/runs', {
			activeExecutionCount: 2,
			collapsed: true,
			projectCount: 39,
		});

		// The number is still in the tree for the sr-only reading; the visible chip is not.
		expect(projects).not.toContain('ml-auto hidden sm:inline-flex');
		expect(runs).not.toContain('ml-auto hidden sm:inline-flex');
	});
});
