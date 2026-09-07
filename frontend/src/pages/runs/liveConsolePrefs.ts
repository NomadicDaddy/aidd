export type ConsoleView = 'pretty' | 'raw';

// Session-scoped so the wrap/view preferences survive switching between runs (and reloads) within
// the tab, but do not leak into a fresh browser session. Plain sessionStorage rather than a
// Zustand persist store because the preferences are local to this one console surface.
const WRAP_PREFERENCE_KEY = 'aidd.liveConsole.wrap';
const VIEW_PREFERENCE_KEY = 'aidd.liveConsole.view';

export function readWrapPreference(): boolean {
	try {
		return sessionStorage.getItem(WRAP_PREFERENCE_KEY) === '1';
	} catch {
		return false;
	}
}

export function readViewPreference(): ConsoleView {
	try {
		return sessionStorage.getItem(VIEW_PREFERENCE_KEY) === 'raw' ? 'raw' : 'pretty';
	} catch {
		return 'pretty';
	}
}

function writePreference(key: string, value: string): void {
	try {
		sessionStorage.setItem(key, value);
	} catch {
		// Storage can be unavailable (private mode quota); the in-memory toggle still works.
	}
}

export function writeWrapPreference(wrap: boolean): void {
	writePreference(WRAP_PREFERENCE_KEY, wrap ? '1' : '0');
}

export function writeViewPreference(view: ConsoleView): void {
	writePreference(VIEW_PREFERENCE_KEY, view);
}
