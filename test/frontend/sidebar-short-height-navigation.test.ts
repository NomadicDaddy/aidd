import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { overflowFlagsForMetrics } from '../../frontend/src/lib/observeOverflow.ts';
import { nearestVerticalScrollTop } from '../../frontend/src/lib/revealWithinScroller.ts';

const SIDEBAR_SOURCE = resolve(
	import.meta.dir,
	'../../frontend/src/components/layout/SidebarNav.tsx',
);

describe('short-height sidebar navigation', () => {
	test('nearest-scrolls a clipped active row above the continuation cue', () => {
		expect(
			nearestVerticalScrollTop({
				currentScrollTop: 0,
				padding: 24,
				scrollerBottom: 611,
				scrollerTop: 120,
				targetBottom: 628,
				targetTop: 592,
			}),
		).toBe(41);
	});

	test('shows the continuation state at the start and clears it at the end', () => {
		const metrics = {
			clientHeight: 491,
			clientWidth: 224,
			scrollHeight: 580,
			scrollLeft: 0,
			scrollWidth: 224,
		};

		expect(overflowFlagsForMetrics({ ...metrics, scrollTop: 0 }).scrollsDown).toBe(true);
		expect(overflowFlagsForMetrics({ ...metrics, scrollTop: 89 }).scrollsDown).toBe(false);
	});

	test('reveals active routes on initialization and focused destinations on demand', async () => {
		const sidebar = await readFile(SIDEBAR_SOURCE, 'utf8');

		expect(sidebar).toContain('querySelector<HTMLElement>(\'a[aria-current="page"]\')');
		expect(sidebar).toContain('}, [collapsed, location.pathname]);');
		expect(sidebar).toContain('onFocus={revealFocusedDestination}');
		expect(sidebar).toContain('data-sidebar-continuation=""');
		expect(sidebar).toContain('group-data-[overflow-down=true]:opacity-100');
	});
});
