import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import type { NavBadges } from '../../frontend/src/components/layout/navBadges.ts';

import { navBadges } from '../../frontend/src/components/layout/navBadges.ts';
import { visibleProjects } from '../../frontend/src/lib/projectVisibility.ts';

const NAV_COUNTS = { audits: 44, recipes: 12, scheduled: 3, skills: 76 };

/**
 * Renders the rail and returns the markup of one destination row, so a badge assertion is made
 * against the anchor it belongs to rather than against the whole nav.
 */
function renderDestination(href: string, props: { badges: NavBadges; collapsed: boolean }): string {
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

function loaded(): NavBadges {
	return navBadges({ activeExecutionCount: 2, navCounts: NAV_COUNTS, projectCount: 39 });
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
		const row = renderDestination('/projects', { badges: loaded(), collapsed: false });

		expect(row).toContain('>39</span>');
		expect(row).toContain('39 discovered projects');
		// Neutral, not the amber the Runs badge uses: Projects counts inventory, Runs counts
		// live work.
		expect(row).toContain('bg-muted text-foreground ring-border');
		expect(row).not.toContain('bg-amber-50');
	});

	test('keeps the live-execution count amber on the Runs row', () => {
		const row = renderDestination('/runs', { badges: loaded(), collapsed: false });

		expect(row).toContain('>2</span>');
		expect(row).toContain('2 active executions');
		expect(row).toContain('bg-amber-50');
	});

	test('counts the four catalog rows in the same neutral tone as Projects', () => {
		const rows: [string, number, string][] = [
			['/audits', NAV_COUNTS.audits, '44 audits'],
			['/recipes', NAV_COUNTS.recipes, '12 recipes'],
			['/scheduled', NAV_COUNTS.scheduled, '3 active scheduled tasks'],
			['/skills', NAV_COUNTS.skills, '76 skills'],
		];

		for (const [href, count, reading] of rows) {
			const row = renderDestination(href, { badges: loaded(), collapsed: false });

			expect(row).toContain(`>${count}</span>`);
			expect(row).toContain(reading);
			// None of the four is a band, only a count, so none of them may claim amber.
			expect(row).toContain('bg-muted text-foreground ring-border');
			expect(row).not.toContain('bg-amber-50');
		}
	});

	test('renders no badge before a count has loaded or when the list is empty', () => {
		const empty = navBadges({
			activeExecutionCount: 0,
			navCounts: { audits: 0, recipes: 0, scheduled: 0, skills: 0 },
			projectCount: 0,
		});
		const loading = navBadges({
			activeExecutionCount: 0,
			navCounts: undefined,
			projectCount: null,
		});

		expect(empty).toEqual({});
		expect(loading).toEqual({});
		for (const badges of [empty, loading]) {
			const row = renderDestination('/skills', { badges, collapsed: false });
			expect(row).not.toContain('bg-muted text-foreground ring-border');
		}
	});

	test('reads a count of one in the singular', () => {
		const badges = navBadges({
			activeExecutionCount: 1,
			navCounts: { audits: 1, recipes: 1, scheduled: 1, skills: 1 },
			projectCount: 1,
		});

		expect(badges['/audits']?.accessibleName).toBe('1 audit');
		expect(badges['/projects']?.accessibleName).toBe('1 discovered project');
		expect(badges['/recipes']?.accessibleName).toBe('1 recipe');
		expect(badges['/runs']?.accessibleName).toBe('1 active execution');
		expect(badges['/scheduled']?.accessibleName).toBe('1 active scheduled task');
		expect(badges['/skills']?.accessibleName).toBe('1 skill');
	});

	test('drops every chip in the collapsed rail, where the row is an icon', () => {
		for (const href of ['/audits', '/projects', '/recipes', '/runs', '/scheduled', '/skills']) {
			const row = renderDestination(href, { badges: loaded(), collapsed: true });

			// The number is still in the tree for the sr-only reading; the visible chip is not.
			expect(row).not.toContain('ml-auto hidden sm:inline-flex');
		}
	});
});
