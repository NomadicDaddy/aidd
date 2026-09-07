import { readResultJson, resultMarker } from 'aidd-shared/agent/result-marker';
import { parseCodexBackendLine } from 'aidd-shared/backends/parsers/codex';

// The marker only opens the payload when it starts a line — the same rule the result parser
// applies, so a message that merely *mentions* the contract keeps its prose intact.
const markerLinePattern = new RegExp(`^[ \\t]*${resultMarker}`, 'gm');
const collapsedMarker = `${resultMarker} { … }`;

/**
 * Replace each `AIDD_RESULT:` payload with a compact placeholder (the same one the live delta
 * pump emits). The final agent message ends with the run's structured result, and for an audit
 * that payload is the entire report markdown encoded as one JSON string — a wall of `\n`-escaped
 * text that buries the sentence the operator actually wants. The payload is already surfaced as
 * the report, the run summary, and the console's final answer.
 */
function collapseResultPayloads(text: string): string {
	const scan = new RegExp(markerLinePattern.source, markerLinePattern.flags);
	let collapsed = '';
	let copied = 0;
	let match: null | RegExpExecArray;
	while ((match = scan.exec(text)) !== null) {
		const payloadStart = match.index + match[0].length;
		const json = readResultJson(text, payloadStart);
		// Unbalanced braces mean a truncated payload with no end to cut to; leave it as written.
		if (json === undefined) continue;
		const end = text.indexOf(json, payloadStart) + json.length;
		collapsed += `${text.slice(copied, match.index)}${collapsedMarker}`;
		copied = end;
		// Resume past the payload so the placeholder just written is not rescanned forever.
		scan.lastIndex = end;
	}
	return copied === 0 ? text : `${collapsed}${text.slice(copied)}`;
}

function hasProse(text: string): boolean {
	return text.split('\n').some((line) => {
		const trimmed = line.trim();
		return trimmed.length > 0 && !trimmed.startsWith(resultMarker);
	});
}

// Pulls the run's final assistant message out of the raw codex log. The most useful
// line in a failed run — e.g. "I'm stopping before implementation because the worktree
// is already dirty…" — is an `agent_message` event buried in the JSONL stream. We scan
// from the end so the first `assistant_text` we find is the last one written, and stop
// immediately (logs can be ~1MB+; agent messages are sparse and we only want the final
// one). Non-codex backends parse to no events and yield null, which the caller treats
// as "no stop detail available".
export function extractStopDetail(rawText: string): null | string {
	if (!rawText) return null;
	const lines = rawText.split(/\r?\n/);
	for (let index = lines.length - 1; index >= 0; index -= 1) {
		const line = lines[index];
		if (line === undefined) continue;
		const events = parseCodexBackendLine(line);
		for (let cursor = events.length - 1; cursor >= 0; cursor -= 1) {
			const event = events[cursor];
			if (event?.type === 'assistant_text' && event.chunk.trim().length > 0) {
				const text = collapseResultPayloads(event.chunk).trim();
				// The last message is the stop detail whatever it holds; when it is nothing but the
				// structured payload there is no "why" to show, and a panel holding only the
				// placeholder is pure noise. Report no stop detail rather than an older message,
				// which would explain some earlier moment of the run as if it were the ending.
				return hasProse(text) ? text : null;
			}
		}
	}
	return null;
}
