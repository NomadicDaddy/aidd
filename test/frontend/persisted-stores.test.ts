import { afterEach, describe, expect, test } from 'bun:test';

import { useAuthTokenStore } from '../../frontend/src/stores/authTokenStore.ts';
import { DASHBOARD_CARD_IDS, useDashboardStore } from '../../frontend/src/stores/dashboardStore.ts';
import { usePrefsStore } from '../../frontend/src/stores/prefsStore.ts';
import { useSidebarStore } from '../../frontend/src/stores/sidebarStore.ts';
import { useTerminalStore } from '../../frontend/src/stores/terminalStore.ts';
import { useThemeStore } from '../../frontend/src/stores/themeStore.ts';

function resetStores(): void {
	useAuthTokenStore.setState({ promptOpen: false, token: '' });
	useDashboardStore.setState({
		cardOrder: [...DASHBOARD_CARD_IDS],
		cardSizes: {},
		locked: true,
	});
	usePrefsStore.setState({ projectView: 'cards' });
	useSidebarStore.setState({ collapsed: false, userChosen: false });
	useTerminalStore.setState({ everOpened: false, open: false });
	useThemeStore.setState({ mode: 'dark' });
}

afterEach(() => {
	delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
	resetStores();
});

describe('persisted Zustand stores', () => {
	test('keep in-memory state usable when browser storage methods throw', () => {
		resetStores();
		const calls = { get: 0, remove: 0, set: 0 };
		const throwingStorage = {
			getItem: () => {
				calls.get += 1;
				throw new Error('denied-read');
			},
			removeItem: () => {
				calls.remove += 1;
				throw new Error('denied-remove');
			},
			setItem: () => {
				calls.set += 1;
				throw new Error('denied-write');
			},
		};
		(globalThis as unknown as { localStorage: unknown }).localStorage = throwingStorage;

		const stores = [
			useAuthTokenStore,
			useDashboardStore,
			usePrefsStore,
			useSidebarStore,
			useTerminalStore,
			useThemeStore,
		];
		expect(() => {
			for (const store of stores) store.persist.rehydrate();
		}).not.toThrow();

		expect(() => {
			useAuthTokenStore.getState().setToken(' resilient-token ');
			useDashboardStore.getState().toggleLocked();
			usePrefsStore.getState().setProjectView('table');
			useSidebarStore.getState().toggle();
			useTerminalStore.getState().setOpen(true);
			useThemeStore.getState().setMode('light');
		}).not.toThrow();

		expect(useAuthTokenStore.getState().token).toBe('resilient-token');
		expect(useDashboardStore.getState().locked).toBe(false);
		expect(usePrefsStore.getState().projectView).toBe('table');
		expect(useSidebarStore.getState()).toMatchObject({ collapsed: true, userChosen: true });
		expect(useTerminalStore.getState()).toMatchObject({ everOpened: true, open: true });
		expect(useThemeStore.getState().mode).toBe('light');

		expect(() => {
			for (const store of stores) store.persist.clearStorage();
		}).not.toThrow();
		expect(calls).toEqual({ get: stores.length, remove: stores.length, set: stores.length });
	});
});
