import type { DataTraceStatus } from './types.ts';

import { TRACE_STORAGE_KEY } from './constants.ts';
import { getStorage, isDevBuild, readConfigDefault, readQueryPreference } from './environment.ts';

export function resolveTrace(): { enabled: boolean; source: DataTraceStatus['source'] } {
	const storage = getStorage();
	const preference = readQueryPreference();
	if (preference === 'enable') {
		storage?.setItem(TRACE_STORAGE_KEY, '1');
		return { enabled: true, source: 'query' };
	}
	if (preference === 'disable') {
		storage?.setItem(TRACE_STORAGE_KEY, '0');
		return { enabled: false, source: 'query' };
	}
	const stored = storage?.getItem(TRACE_STORAGE_KEY);
	if (stored === '1') return { enabled: true, source: 'localStorage' };
	if (stored === '0') return { enabled: false, source: 'localStorage' };
	return { enabled: readConfigDefault(), source: 'config' };
}

export function getDataTraceStatus(): DataTraceStatus {
	const { enabled, source } = resolveTrace();
	return {
		buildMode: isDevBuild() ? 'development' : 'production',
		enabled,
		source,
		storageKey: TRACE_STORAGE_KEY,
	};
}

export function isTraceEnabled(): boolean {
	return getDataTraceStatus().enabled;
}

export function createTraceId(prefix = 'trace'): string {
	const random =
		typeof crypto !== 'undefined' && 'randomUUID' in crypto
			? crypto.randomUUID()
			: Math.random().toString(36).slice(2);
	return `${prefix}-${random}`;
}
