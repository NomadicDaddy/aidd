import { afterEach, describe, expect, mock, test } from 'bun:test';
import { enableDataTrace } from '../../frontend/src/lib/dataMovementTrace.ts';
import { usePrefsStore } from '../../frontend/src/stores/prefsStore.ts';
import { useSidebarStore } from '../../frontend/src/stores/sidebarStore.ts';
import { useThemeStore } from '../../frontend/src/stores/themeStore.ts';

const originalConsoleInfo = console.info;
const originalConsoleGroupCollapsed = console.groupCollapsed;
const originalConsoleGroupEnd = console.groupEnd;

function installWindow(): void {
	const storage = new Map<string, string>();
	const localStorage = {
		getItem: (key: string) => storage.get(key) ?? null,
		removeItem: (key: string) => {
			storage.delete(key);
		},
		setItem: (key: string, value: string) => {
			storage.set(key, value);
		},
	};
	(globalThis as unknown as { localStorage: unknown }).localStorage = localStorage;
	(globalThis as unknown as { window: unknown }).window = {
		localStorage,
		location: new URL('http://localhost/'),
	};
}

afterEach(() => {
	delete (globalThis as unknown as { window?: unknown }).window;
	delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
	console.info = originalConsoleInfo;
	console.groupCollapsed = originalConsoleGroupCollapsed;
	console.groupEnd = originalConsoleGroupEnd;
	mock.restore();
});

describe('traced Zustand setters', () => {
	test('emit state updates with changed keys and compact summaries', () => {
		installWindow();
		const records: unknown[] = [];
		console.info = mock((record: unknown) => records.push(record)) as typeof console.info;
		console.groupCollapsed = mock(() => {}) as typeof console.groupCollapsed;
		console.groupEnd = mock(() => {}) as typeof console.groupEnd;
		enableDataTrace();

		useThemeStore.getState().setMode('light');
		useSidebarStore.getState().toggle();
		usePrefsStore.getState().setProjectView('table');
		usePrefsStore.getState().setRecipesView('table');

		const objectRecords = records.filter((record) => typeof record === 'object');
		expect(objectRecords).toHaveLength(5);
		const encoded = JSON.stringify(objectRecords);
		expect(encoded).toContain('trace.enabled');
		expect(encoded).toContain('themeStore');
		expect(encoded).toContain('sidebarStore');
		expect(encoded).toContain('prefsStore');
		expect(encoded).toContain('changedKeys');
		const stateEncoded = JSON.stringify(
			objectRecords.filter(
				(record) =>
					typeof record === 'object' &&
					record !== null &&
					'layer' in record &&
					record.layer === 'state'
			)
		);
		expect(stateEncoded).not.toContain('localStorage');
	});
});
