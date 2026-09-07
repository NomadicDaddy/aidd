import { formatBytes, utf8ByteLength } from './formatters.ts';

export interface OutputSlice {
	omittedBytes: number;
	shownBytes: number;
	totalBytes: number;
}

/** Describe a byte slice without trusting a stale reported total over bytes already loaded. */
export function describeByteSlice(shownBytes: number, reportedTotalBytes: number): OutputSlice {
	const totalBytes = Math.max(shownBytes, reportedTotalBytes);
	return {
		omittedBytes: totalBytes - shownBytes,
		shownBytes,
		totalBytes,
	};
}

/** Compare loaded text with a filesystem byte count using the same UTF-8 unit. */
export function describeOutputSlice(text: string, reportedTotalBytes: number): OutputSlice {
	return describeByteSlice(utf8ByteLength(text), reportedTotalBytes);
}

/** Human disclosure for a head or tail slice; complete content needs no disclosure. */
export function formatOutputSlice(
	slice: OutputSlice,
	position: 'first' | 'most recent',
): null | string {
	if (slice.omittedBytes <= 0) return null;
	return `Showing the ${position} ${formatBytes(slice.shownBytes)} of ${formatBytes(slice.totalBytes)} — ${formatBytes(slice.omittedBytes)} omitted.`;
}
