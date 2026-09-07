import type { DataMovementTraceEvent, TraceRecord } from './types.ts';

import { TRACE_STORAGE_KEY } from './constants.ts';
import { getWindow } from './environment.ts';
import { formatTraceLabel } from './formatting.ts';
import { getDataTraceStatus, isTraceEnabled } from './status.ts';

export function writeTraceRecord(event: TraceRecord): void {
	const record = {
		...event,
	};
	const label = formatTraceLabel(record);
	// eslint-disable-next-line no-console
	if (typeof console.groupCollapsed === 'function' && typeof console.groupEnd === 'function') {
		// eslint-disable-next-line no-console
		console.groupCollapsed(label);
		console.info(record);
		// eslint-disable-next-line no-console
		console.groupEnd();
	} else {
		console.info(label, record);
	}
}

export function traceDataMovement(event: DataMovementTraceEvent): void {
	if (!isTraceEnabled()) return;
	writeTraceRecord({
		...event,
		timestamp: event.timestamp ?? new Date().toISOString(),
	});
}

export function enableDataTrace(): void {
	getStorage()?.setItem(TRACE_STORAGE_KEY, '1');
	writeTraceRecord({
		category: 'event',
		layer: 'ui',
		operation: 'trace.enabled',
		source: 'window.aiddTrace',
		summary: { ...getDataTraceStatus() },
		timestamp: new Date().toISOString(),
	});
}

export function disableDataTrace(): void {
	writeTraceRecord({
		category: 'event',
		layer: 'ui',
		operation: 'trace.disabled',
		source: 'window.aiddTrace',
		timestamp: new Date().toISOString(),
	});
	getStorage()?.setItem(TRACE_STORAGE_KEY, '0');
}

function getStorage() {
	const win = getWindow();
	if (!win) return undefined;
	try {
		return win.localStorage;
	} catch {
		return undefined;
	}
}

export function installTraceApi(): void {
	const win = getWindow();
	if (!win) return;
	win.aiddTrace = {
		disable: disableDataTrace,
		enable: enableDataTrace,
		status: getDataTraceStatus,
	};
	if (isTraceEnabled()) {
		writeTraceRecord({
			category: 'event',
			layer: 'ui',
			operation: 'trace.ready',
			source: 'dataMovementTrace',
			summary: { ...getDataTraceStatus() },
			timestamp: new Date().toISOString(),
		});
	}
}
