import { parseCodexBackendLine } from 'aidd-shared/backends/parsers/codex';

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
			if (event?.type === 'assistant_text') {
				const text = event.chunk.trim();
				if (text.length > 0) return text;
			}
		}
	}
	return null;
}
