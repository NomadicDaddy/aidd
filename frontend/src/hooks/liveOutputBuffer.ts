// Ceiling on the in-memory live-output buffer (the textRef accumulator + `text` state in
// useRunLiveOutput). A multi-hour run can stream tens of MB of stdout; without a cap the retained
// JS string grows without bound and the tab's heap climbs for the whole run. Rendering is already
// windowed (the console only paints a tail) and the full transcript remains on disk via the
// backfill snapshot (run-output query, which reports truncated/totalBytes), so dropping the oldest
// characters from the head is invisible to the operator while bounding heap on the longest runs.
export const MAX_LIVE_OUTPUT_CHARS = 2_000_000;

// Keep only the trailing MAX_LIVE_OUTPUT_CHARS characters. Trimming from the head preserves the
// suffix the snapshot-overlap dedup inspects, so capping never corrupts that logic.
export function capLiveBuffer(text: string): string {
	return text.length > MAX_LIVE_OUTPUT_CHARS ? text.slice(-MAX_LIVE_OUTPUT_CHARS) : text;
}

// Extract the `chunk` string from a run_output WebSocket payload, or null when the payload is not a
// well-formed `{ chunk: string }` object. Keeps the socket-message parsing out of the hook body.
export function readChunk(payload: unknown): null | string {
	if (!payload || typeof payload !== 'object') return null;
	const chunk = (payload as { chunk?: unknown }).chunk;
	return typeof chunk === 'string' ? chunk : null;
}

// Extract the `status` string from a run_status WebSocket payload, or null when absent/malformed.
export function readStatus(payload: unknown): null | string {
	if (!payload || typeof payload !== 'object') return null;
	const status = (payload as { status?: unknown }).status;
	return typeof status === 'string' ? status : null;
}

// Length of the longest suffix of `text` that equals a prefix of `chunk`. The on-disk transcript is
// append-only, so an overlap between an adopted snapshot tail and an in-flight chunk is always a
// suffix-of-text / prefix-of-chunk match; this is the dedup measure used to trim doubled output.
export function suffixPrefixOverlap(text: string, chunk: string): number {
	for (let len = Math.min(text.length, chunk.length); len > 0; len--) {
		if (text.slice(-len) === chunk.slice(0, len)) return len;
	}
	return 0;
}
