import type { AgentEvent } from 'aidd-shared/backends/types';

import { resultMarker } from 'aidd-shared/agent/result-marker';
import {
	denialSummary,
	isWorkspacePolicyDenial,
} from 'aidd-shared/agent/tools/shell-policy-denial';
import { escapeNativeLogLine } from 'aidd-shared/backends/parsers/native';

function asRecord(value: unknown): null | Record<string, unknown> {
	return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function stringField(record: null | Record<string, unknown>, key: string): null | string {
	if (!record) return null;
	const value = record[key];
	return typeof value === 'string' && value.length > 0 ? value : null;
}

function summarizeToolArgs(tool: string, args: unknown): string {
	const record = asRecord(args);
	const command = stringField(record, 'command');
	if (command) return command;
	const path = stringField(record, 'path');
	if (path) return path;
	const pattern = stringField(record, 'pattern');
	if (pattern) return pattern;
	if (record) {
		const compact = JSON.stringify(record);
		return compact.length > 200 ? `${compact.slice(0, 200)}…` : compact;
	}
	if (typeof args === 'string') return args;
	return tool;
}

function renderToolCall(tool: string, args: unknown): string {
	const summary = summarizeToolArgs(tool, args);
	if (tool === 'bash') return `$ ${summary}`;
	if (tool === 'read_file') return `→ read ${summary}`;
	if (tool === 'edit_file') return `→ edit ${summary}`;
	if (tool === 'write_file') return `→ write ${summary}`;
	if (tool === 'list_directory') return `→ list ${summary}`;
	return `→ ${tool} ${summary}`;
}

/** Model prose is untrusted input to the log grammar; every line of it is escaped. */
/**
 * Render an error event's `meta` for a run-log line.
 *
 * Not `String()`: the idle monitor sends `{ killMs }` (shared/src/backends/monitor.ts) and the
 * plain parser sends `{ exitCode, stderr }`, so stringifying reduced the one detail the line
 * exists to carry to `[object Object]`. Same idiom as details/shared.ts.
 */
function describeErrorMeta(meta: unknown): string {
	return typeof meta === 'string' ? meta : JSON.stringify(meta);
}

function escapeProse(text: string): string {
	return text.split('\n').map(escapeNativeLogLine).join('\n');
}

// The AIDD_RESULT payload can be tens of thousands of characters of JSON. The console
// should show the model's narration and that a result was emitted, not the raw blob.
function renderAssistantText(chunk: string): null | string {
	const trimmed = chunk.trim();
	if (trimmed.length === 0) return null;
	const markerIndex = trimmed.indexOf(resultMarker);
	if (markerIndex === -1) return escapeProse(trimmed);
	const narration = trimmed.slice(0, markerIndex).trim();
	const resultNote = `${resultMarker} { … }`;
	return narration.length > 0 ? `${escapeProse(narration)}\n${resultNote}` : resultNote;
}

// Reasoning deltas are progress, not transcript: raw thinking can run to tens of KB per
// turn, so the log gets a compact liveness line at most once per interval instead.
const REASONING_LINE_INTERVAL_MS = 15_000;

function formatReasoningChars(chars: number): string {
	return chars >= 1000 ? `${(chars / 1000).toFixed(1)}k` : `${chars}`;
}

/**
 * Stateful wrapper around {@link renderNativeRunLogLine} for live-streamed turns. Text
 * deltas pass through verbatim (already marker-gated by the agent loop); reasoning deltas
 * collapse into a throttled `[reasoning… Nk chars]` liveness line; and the turn-final
 * `assistant_text` is suppressed when its content already streamed as deltas, so the
 * transcript is never doubled. One instance per run log.
 */
export class NativeRunLogRenderer {
	private atLineStart = true;
	private lastReasoningLineAtMs = 0;
	private reasoningChars = 0;
	private streamedTextThisTurn = false;

	/**
	 * Escape streamed prose. Deltas are arbitrary fragments rather than whole lines — a marker can
	 * even split across two of them — so escaping has to follow the column: a fragment's first
	 * segment is only at a line start when the previous fragment ended one.
	 */
	private streamProse(chunk: string): string {
		const escaped = chunk
			.split('\n')
			.map((segment, index) =>
				index === 0 && !this.atLineStart ? segment : escapeNativeLogLine(segment),
			)
			.join('\n');
		this.atLineStart = chunk.endsWith('\n');
		return escaped;
	}

	render(event: AgentEvent, nowMs = Date.now()): null | string {
		if (event.type === 'assistant_delta') {
			if (event.kind === 'text') {
				this.streamedTextThisTurn = true;
				return this.streamProse(event.chunk);
			}
			this.reasoningChars += event.chunk.length;
			if (this.lastReasoningLineAtMs === 0) {
				this.lastReasoningLineAtMs = nowMs;
				return this.structural('[reasoning…]\n');
			}
			if (nowMs - this.lastReasoningLineAtMs >= REASONING_LINE_INTERVAL_MS) {
				this.lastReasoningLineAtMs = nowMs;
				return this.structural(
					`[reasoning… ${formatReasoningChars(this.reasoningChars)} chars]\n`,
				);
			}
			return null;
		}
		// Turn-boundary events reset the per-turn streaming state. Passive events (usage,
		// raw_log nudges, idle warnings) can arrive between the last delta and the final
		// assistant_text and must not clear the suppression flag.
		if (
			event.type === 'assistant_text' ||
			event.type === 'tool_call' ||
			event.type === 'error' ||
			event.type === 'done'
		) {
			const streamedText = this.streamedTextThisTurn;
			this.streamedTextThisTurn = false;
			this.reasoningChars = 0;
			this.lastReasoningLineAtMs = 0;
			if (event.type === 'assistant_text' && streamedText) return null;
		}
		return this.structural(renderNativeRunLogLine(event));
	}

	/**
	 * A structural line must own its line. A text delta can end mid-line, and appending a marker to
	 * that partial line both corrupts the prose and hides the marker from the parser, so an
	 * unterminated line is closed first.
	 */
	private structural(line: null | string): null | string {
		if (line === null) return null;
		const owned = this.atLineStart ? line : `\n${line}`;
		this.atLineStart = true;
		return owned;
	}
}

/**
 * Render a native-backend agent event as a human-readable run-log line, or `null`
 * to skip it. The native backend emits structured events with no stdout transcript,
 * so the web Runs console has nothing to show unless these are rendered. Process-based
 * backends already surface their full stdout via `raw_log` and must not be rendered
 * here (it would duplicate the transcript).
 */
export function renderNativeRunLogLine(event: AgentEvent): null | string {
	switch (event.type) {
		case 'assistant_text': {
			const text = renderAssistantText(event.chunk);
			return text === null ? null : `${text}\n`;
		}
		case 'done':
			return `[done] exit ${event.exitCode}\n`;
		case 'error': {
			const meta = event.meta === undefined ? '' : `: ${describeErrorMeta(event.meta)}`;
			return `[error] ${event.reason}${meta}\n`;
		}
		case 'idle_warning':
			return `[idle] no progress for ${Math.round(event.afterMs / 1000)}s\n`;
		case 'rate_limit':
			return `[rate-limit]${event.resetAt ? ` until ${event.resetAt}` : ''}\n`;
		case 'tool_call':
			return `${renderToolCall(event.tool, event.args)}\n`;
		// Tool results are otherwise omitted (they are the bulk of a run's bytes), but a workspace
		// denial has to be visible: the `$ …` line above is logged when the model *requests* the
		// command, so without this a denied command and an executed one read identically.
		case 'tool_result':
			return isWorkspacePolicyDenial(event.result)
				? `[denied] ${denialSummary(event.result as string)}\n`
				: null;
		default:
			return null;
	}
}
