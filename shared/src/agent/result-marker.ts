export const resultMarker = 'AIDD_RESULT:';

/**
 * Read the brace-balanced JSON object that follows an `AIDD_RESULT:` marker.
 *
 * Returns the raw JSON slice when the object closes cleanly, or `undefined` when
 * the braces never balance (a truncated / still-streaming result). String
 * contents are skipped so braces inside report markdown do not confuse depth
 * tracking.
 */
export function readResultJson(text: string, startIndex: number): string | undefined {
	let index = startIndex;
	while (index < text.length && /\s/.test(text[index] ?? '')) index++;
	if (text[index] !== '{') return undefined;

	let depth = 0;
	let escaped = false;
	let inString = false;
	for (let cursor = index; cursor < text.length; cursor++) {
		const char = text[cursor];

		if (inString) {
			if (escaped) escaped = false;
			else if (char === '\\') escaped = true;
			else if (char === '"') inString = false;
			continue;
		}

		if (char === '"') inString = true;
		else if (char === '{') depth++;
		else if (char === '}') {
			depth--;
			if (depth === 0) return text.slice(index, cursor + 1);
		}
	}

	return undefined;
}

/**
 * Extract the last parseable `AIDD_RESULT:` object from raw assistant text.
 *
 * Returns `undefined` when no marker is present or every candidate fails to
 * parse (for example a truncated payload whose braces never balance).
 */
export function extractResultFromText(text: string): Record<string, unknown> | undefined {
	return analyzeResultMarkers(text).result;
}

/**
 * True when the text carries a brace-balanced `AIDD_RESULT:` slice that is not valid JSON AND no
 * other valid marker rescues it — a placeholder such as
 * `AIDD_RESULT: { … }` or otherwise botched completion signal with no usable result. This is
 * distinct from a genuinely absent marker and from a still-truncated (unbalanced) payload: the
 * agent signalled completion but the body could not be parsed. Lets the heuristic layer nudge a
 * re-emit instead of silently treating the turn as complete.
 */
export function extractMalformedResultMarker(text: string): boolean {
	const { malformedMarker, result } = analyzeResultMarkers(text);
	return malformedMarker && result === undefined;
}

interface ResultMarkerAnalysis {
	malformedMarker: boolean;
	result: Record<string, unknown> | undefined;
}

/**
 * The marker only counts when it opens a line (leading whitespace allowed, so a marker indented
 * inside a fenced block still signals). An inline mention — "the contract shape is AIDD_RESULT:
 * {…}" — is the agent *talking about* the protocol, not invoking it, and must never be mistaken
 * for one: taken as a result it would overwrite the real payload with the example.
 */
const markerLinePattern = new RegExp(`^[ \\t]*${resultMarker}`, 'gm');

function analyzeResultMarkers(text: string): ResultMarkerAnalysis {
	let result: Record<string, unknown> | undefined;
	let malformedMarker = false;

	const scan = new RegExp(markerLinePattern.source, markerLinePattern.flags);
	let match: null | RegExpExecArray;

	while ((match = scan.exec(text)) !== null) {
		const payloadStart = match.index + match[0].length;
		const jsonText = readResultJson(text, payloadStart);
		// An unbalanced slice (truncated / still-streaming payload) is neither a result nor a
		// malformed marker — skip it and keep scanning for a later, complete marker.
		if (jsonText === undefined) continue;

		// Resume *after* the payload we just consumed. A marker quoted inside it (a summary that
		// mentions the contract, say) belongs to this result; rescanning from inside the object
		// would parse the quoted fragment as a fresh, emptier marker and let it win.
		scan.lastIndex = text.indexOf(jsonText, payloadStart) + jsonText.length;

		try {
			// readResultJson only ever returns a brace-balanced slice starting at '{', so a parse
			// that succeeds yields an object: there is no non-object case to consider here.
			result = JSON.parse(jsonText) as Record<string, unknown>;
		} catch {
			// Brace-balanced but unparseable: the marker looked complete yet was not valid JSON.
			// The agent tried to signal completion but botched the payload.
			malformedMarker = true;
		}
	}

	return { malformedMarker, result };
}

/**
 * True when the text carries a fully-formed, parseable `AIDD_RESULT:` block —
 * the protocol's explicit completion signal. A truncated payload returns false
 * so genuine incompleteness still triggers a continuation nudge.
 */
export function hasParseableResult(text: string): boolean {
	return extractResultFromText(text) !== undefined;
}
