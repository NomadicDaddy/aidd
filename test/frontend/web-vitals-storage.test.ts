import { afterEach, describe, expect, test } from 'bun:test';
import {
	batchesByUrl,
	describeShiftSource,
	metricPathname,
	shouldLogToConsole,
} from '../../frontend/src/lib/webVitals.ts';

type TestWindow = {
	localStorage: {
		getItem: (key: string) => null | string;
	};
};

const globalWithWindow = globalThis as unknown as { window?: TestWindow };
const originalWindow = globalWithWindow.window;

function installStorage(getItem: TestWindow['localStorage']['getItem']): void {
	globalWithWindow.window = { localStorage: { getItem } };
}

afterEach(() => {
	if (originalWindow) {
		globalWithWindow.window = originalWindow;
		return;
	}
	delete globalWithWindow.window;
});

/**
 * Every "poor" LCP in a day of panel use landed on /scheduled, and every one of them arrived in a
 * flush of its own — minutes after the load it measured, whose FCP was under half a second and
 * whose slowest request took 750ms. The route was read once at flush time, so a late report was
 * filed against wherever the operator had navigated to by then.
 */
describe('Web Vitals route attribution', () => {
	test('files a load metric against the route the document loaded on', () => {
		for (const name of ['TTFB', 'FCP', 'LCP']) {
			expect(metricPathname(name, '/runs', '/scheduled')).toBe('/runs');
		}
	});

	test('files an accruing metric against the route it reports from', () => {
		for (const name of ['CLS', 'INP']) {
			expect(metricPathname(name, '/runs', '/scheduled')).toBe('/scheduled');
		}
	});

	test('falls back to the current route before the load route is known', () => {
		expect(metricPathname('LCP', null, '/scheduled')).toBe('/scheduled');
	});

	test('splits a flush that spans a navigation into one batch per route', () => {
		const batches = batchesByUrl([
			{ name: 'LCP', navigationType: 'navigate', rating: 'poor', url: '/runs', value: 30312 },
			{
				name: 'CLS',
				navigationType: 'navigate',
				rating: 'good',
				url: '/scheduled',
				value: 0,
			},
			{ name: 'FCP', navigationType: 'navigate', rating: 'good', url: '/runs', value: 476 },
		]);

		expect(batches).toEqual([
			{
				metrics: [
					{ name: 'LCP', navigationType: 'navigate', rating: 'poor', value: 30312 },
					{ name: 'FCP', navigationType: 'navigate', rating: 'good', value: 476 },
				],
				url: '/runs',
			},
			{
				metrics: [{ name: 'CLS', navigationType: 'navigate', rating: 'good', value: 0 }],
				url: '/scheduled',
			},
		]);
	});
});

describe('Layout shift source description', () => {
	test('names the element well enough to find it in the source', () => {
		expect(
			describeShiftSource({ className: 'grid min-w-0 gap-5', id: 'history', tagName: 'DIV' }),
		).toBe('div#history.grid.min-w-0.gap-5');
	});

	test('omits the parts an element does not have', () => {
		expect(describeShiftSource({ className: '  ', id: '', tagName: 'TABLE' })).toBe('table');
	});

	test('survives a node with no tag name and an SVG class object', () => {
		expect(describeShiftSource(null)).toBe('unknown');
		expect(describeShiftSource({ nodeType: 3 })).toBe('unknown');
		expect(describeShiftSource({ className: { baseVal: 'icon' }, tagName: 'svg' })).toBe('svg');
	});
});

describe('Web Vitals diagnostic logging', () => {
	test('uses the exact crawltest opt-in when storage is accessible', () => {
		const keys: string[] = [];
		let storedValue: null | string = '1';
		installStorage((key) => {
			keys.push(key);
			return storedValue;
		});

		expect(shouldLogToConsole(false)).toBe(true);
		storedValue = 'true';
		expect(shouldLogToConsole(false)).toBe(false);
		expect(keys).toEqual(['aidd:crawltest', 'aidd:crawltest']);
	});

	test('stays disabled when the crawltest opt-in is absent', () => {
		installStorage(() => null);

		expect(shouldLogToConsole(false)).toBe(false);
	});

	test('stays disabled when storage access throws', () => {
		installStorage(() => {
			throw new DOMException('Storage denied', 'SecurityError');
		});

		expect(() => shouldLogToConsole(false)).not.toThrow();
		expect(shouldLogToConsole(false)).toBe(false);
	});

	test('development logging short-circuits storage access', () => {
		installStorage(() => {
			throw new DOMException('Storage denied', 'SecurityError');
		});

		expect(shouldLogToConsole(true)).toBe(true);
	});
});
