import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { nearestHorizontalScrollLeft } from '../../frontend/src/lib/revealWithinScroller.ts';
import { resolveTabFocusTarget } from '../../frontend/src/lib/tabNavigation.ts';

const frontendSource = join(process.cwd(), 'frontend', 'src');

describe('compact tab active-trigger visibility', () => {
	test('uses nearest horizontal positioning without disturbing an already-visible trigger', () => {
		expect(
			nearestHorizontalScrollLeft({
				currentScrollLeft: 500,
				padding: 24,
				scrollerLeft: 100,
				scrollerRight: 900,
				targetLeft: 300,
				targetRight: 450,
			}),
		).toBe(500);
		expect(
			nearestHorizontalScrollLeft({
				currentScrollLeft: 500,
				padding: 24,
				scrollerLeft: 100,
				scrollerRight: 900,
				targetLeft: 925,
				targetRight: 1075,
			}),
		).toBe(699);
		expect(
			nearestHorizontalScrollLeft({
				currentScrollLeft: 500,
				padding: 24,
				scrollerLeft: 100,
				scrollerRight: 900,
				targetLeft: -50,
				targetRight: 75,
			}),
		).toBe(326);
	});

	test('supports a wider pinned leading track without wasting the trailing edge', () => {
		expect(
			nearestHorizontalScrollLeft({
				currentScrollLeft: 800,
				endPadding: 24,
				scrollerLeft: 100,
				scrollerRight: 900,
				startPadding: 280,
				targetLeft: 300,
				targetRight: 460,
			}),
		).toBe(720);
	});

	test('reveals the selected tab with edge-fade clearance on mount', async () => {
		const [reveal, scroller, tabs] = await Promise.all([
			readFile(join(frontendSource, 'lib', 'revealWithinScroller.ts'), 'utf8'),
			readFile(join(frontendSource, 'components', 'shared', 'OverflowScroller.tsx'), 'utf8'),
			readFile(join(frontendSource, 'components', 'ui', 'tabs.tsx'), 'utf8'),
		]);

		expect(tabs).toContain('revealElementId={tabButtonId(idPrefix, activeTab)}');
		expect(tabs).toContain('revealHorizontalPadding={TAB_REVEAL_GUTTER}');
		expect(tabs).toContain(
			'<span aria-hidden="true" className="w-4 shrink-0" role="presentation" />',
		);
		expect(scroller).toContain(
			'revealElementWithinScroller(scroller, target, 0, revealHorizontalPadding)',
		);
		expect(scroller).toContain('}, [revealElementId, revealHorizontalPadding]);');
		expect(reveal).toContain('scroller.scrollLeft = nextScrollLeft');
		expect(reveal).not.toContain('scrollIntoView');
	});

	test('keeps keyboard focus traversal separate from activation', async () => {
		const [navigation, tabs] = await Promise.all([
			readFile(join(frontendSource, 'lib', 'tabNavigation.ts'), 'utf8'),
			readFile(join(frontendSource, 'components', 'ui', 'tabs.tsx'), 'utf8'),
		]);

		expect(tabs).toContain('node.focus({ preventScroll: true })');
		expect(tabs).toContain('revealElementWithinScroller(scroller, node, 0, TAB_REVEAL_GUTTER)');
		expect(tabs).toContain('onClick={() => onChange(tab.id)}');
		expect(tabs).toContain('resolveTabFocusTarget(tabIds, currentId, event.key)');
		expect(tabs).not.toContain('function focusTab(id: T) {\n\t\tonChange(id);');
		for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
			expect(navigation).toContain(`key === '${key}'`);
		}
	});

	test('resolves every focus key from the currently focused tab', () => {
		const tabIds = ['overview', 'features', 'milestones', 'runs'] as const;
		let focused = resolveTabFocusTarget(tabIds, 'overview', 'ArrowRight');
		expect(focused).toBe('features');
		focused = resolveTabFocusTarget(tabIds, focused ?? 'overview', 'ArrowRight');
		expect(focused).toBe('milestones');
		expect(resolveTabFocusTarget(tabIds, 'overview', 'ArrowLeft')).toBe('runs');
		expect(resolveTabFocusTarget(tabIds, 'features', 'Home')).toBe('overview');
		expect(resolveTabFocusTarget(tabIds, 'features', 'End')).toBe('runs');
		expect(resolveTabFocusTarget(tabIds, 'overview', 'Enter')).toBeUndefined();
		expect(resolveTabFocusTarget(tabIds, 'missing', 'ArrowRight')).toBeUndefined();
		expect(resolveTabFocusTarget([], 'overview', 'ArrowRight')).toBeUndefined();
	});
});
