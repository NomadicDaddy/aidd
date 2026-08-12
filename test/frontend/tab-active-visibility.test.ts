import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { nearestHorizontalScrollLeft } from '../../frontend/src/lib/revealWithinScroller.ts';

const frontendSource = join(process.cwd(), 'frontend', 'src');

describe('compact tab active-trigger visibility', () => {
	test('uses nearest horizontal positioning without disturbing an already-visible trigger', () => {
		expect(
			nearestHorizontalScrollLeft({
				currentScrollLeft: 500,
				scrollerLeft: 100,
				scrollerRight: 900,
				targetLeft: 300,
				targetRight: 450,
			}),
		).toBe(500);
		expect(
			nearestHorizontalScrollLeft({
				currentScrollLeft: 500,
				scrollerLeft: 100,
				scrollerRight: 900,
				targetLeft: 925,
				targetRight: 1075,
			}),
		).toBe(675);
		expect(
			nearestHorizontalScrollLeft({
				currentScrollLeft: 500,
				scrollerLeft: 100,
				scrollerRight: 900,
				targetLeft: -50,
				targetRight: 75,
			}),
		).toBe(350);
	});

	test('wires direct-link and active-tab changes through the shared scrollport', async () => {
		const [reveal, scroller, tabs] = await Promise.all([
			readFile(join(frontendSource, 'lib', 'revealWithinScroller.ts'), 'utf8'),
			readFile(join(frontendSource, 'components', 'shared', 'OverflowScroller.tsx'), 'utf8'),
			readFile(join(frontendSource, 'components', 'ui', 'tabs.tsx'), 'utf8'),
		]);

		expect(tabs).toContain('revealElementId={tabButtonId(idPrefix, activeTab)}');
		expect(scroller).toContain('}, [revealElementId]);');
		expect(reveal).toContain('scroller.scrollLeft = nextScrollLeft');
		expect(reveal).not.toContain('scrollIntoView');
	});

	test('preserves focus for keyboard and pointer tab changes', async () => {
		const tabs = await readFile(join(frontendSource, 'components', 'ui', 'tabs.tsx'), 'utf8');

		expect(tabs).toContain('node.focus({ preventScroll: true })');
		expect(tabs).toContain('revealElementWithinScroller(scroller, node)');
		expect(tabs).toContain('onClick={() => onChange(tab.id)}');
		for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
			expect(tabs).toContain(`event.key === '${key}'`);
		}
	});
});
