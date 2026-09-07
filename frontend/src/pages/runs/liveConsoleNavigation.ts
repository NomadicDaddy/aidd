import type { RunOutputWindowRequest } from '../../api/types.ts';

import { formatBytes, utf8ByteLength } from '../../lib/formatters.ts';

const FALLBACK_WINDOW_LIMIT_BYTES = 2 * 1024 * 1024;

export interface TranscriptWindow {
	endByte: number;
	startByte: number;
	totalBytes: number;
	windowLimitBytes: number;
}

export function describeTranscriptWindow({
	endByte,
	message,
	startByte,
	totalBytes,
	windowLimitBytes,
}: {
	endByte: null | number | undefined;
	message: string;
	startByte: null | number | undefined;
	totalBytes: null | number | undefined;
	windowLimitBytes: null | number | undefined;
}): TranscriptWindow {
	const messageBytes = utf8ByteLength(message);
	const normalizedTotal = Math.max(0, totalBytes ?? messageBytes);
	const normalizedEnd = Math.min(normalizedTotal, Math.max(0, endByte ?? normalizedTotal));
	return {
		endByte: normalizedEnd,
		startByte: Math.min(normalizedEnd, Math.max(0, startByte ?? normalizedEnd - messageBytes)),
		totalBytes: normalizedTotal,
		windowLimitBytes: windowLimitBytes ?? FALLBACK_WINDOW_LIMIT_BYTES,
	};
}

export function beginningWindow(window: TranscriptWindow): null | RunOutputWindowRequest {
	if (window.startByte === 0 || window.totalBytes === 0) return null;
	return {
		endByte: Math.min(window.totalBytes, window.windowLimitBytes),
		startByte: 0,
	};
}

export function olderWindow(window: TranscriptWindow): null | RunOutputWindowRequest {
	if (window.startByte === 0) return null;
	return {
		endByte: window.startByte,
		startByte: Math.max(0, window.startByte - window.windowLimitBytes),
	};
}

export function newerWindow(window: TranscriptWindow): null | RunOutputWindowRequest {
	if (window.endByte >= window.totalBytes) return null;
	return {
		endByte: Math.min(window.totalBytes, window.endByte + window.windowLimitBytes),
		startByte: window.endByte,
	};
}

export function formatTranscriptPosition(window: TranscriptWindow): string {
	return `Showing ${formatBytes(window.startByte)}–${formatBytes(window.endByte)} of ${formatBytes(window.totalBytes)}`;
}
