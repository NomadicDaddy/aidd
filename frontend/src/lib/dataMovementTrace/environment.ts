import type { ImportMetaWithEnv, TraceDocument, TraceStorage, TraceWindow } from './types.ts';

import { TRACE_QUERY_PARAM } from './constants.ts';

export function isDevBuild(): boolean {
	const env = (import.meta as ImportMetaWithEnv).env;
	return env?.DEV !== false;
}

export function getWindow(): TraceWindow | undefined {
	return (globalThis as unknown as { window?: TraceWindow }).window;
}

export function getStorage(): TraceStorage | undefined {
	const win = getWindow();
	if (!win) return undefined;
	try {
		return win.localStorage;
	} catch {
		return undefined;
	}
}

export function readQueryPreference(): 'disable' | 'enable' | null {
	const win = getWindow();
	if (!win?.location) return null;
	const value = new URL(win.location.href).searchParams.get(TRACE_QUERY_PARAM);
	if (value === '1' || value === 'true') return 'enable';
	if (value === '0' || value === 'false') return 'disable';
	return null;
}

export function getDocument(): TraceDocument | undefined {
	return (globalThis as unknown as { document?: TraceDocument }).document;
}

export function readConfigDefault(): boolean {
	const content = getDocument()
		?.querySelector('meta[name="aidd-trace-default"]')
		?.getAttribute('content');
	return content === 'true';
}
