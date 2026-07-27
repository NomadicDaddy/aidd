import { afterEach, describe, expect, test } from 'bun:test';
import { shouldLogToConsole } from '../../frontend/src/lib/webVitals.ts';

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
