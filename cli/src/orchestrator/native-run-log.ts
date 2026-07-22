import type { AgentEvent } from 'aidd-shared/backends/types';

import { resultMarker } from 'aidd-shared/agent/result-marker';

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

// The AIDD_RESULT payload can be tens of thousands of characters of JSON. The console
// should show the model's narration and that a result was emitted, not the raw blob.
function renderAssistantText(chunk: string): null | string {
	const trimmed = chunk.trim();
	if (trimmed.length === 0) return null;
	const markerIndex = trimmed.indexOf(resultMarker);
	if (markerIndex === -1) return trimmed;
	const narration = trimmed.slice(0, markerIndex).trim();
	const resultNote = `${resultMarker} { … }`;
	return narration.length > 0 ? `${narration}\n${resultNote}` : resultNote;
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
	private lastReasoningLineAtMs = 0;
	private reasoningChars = 0;
	private streamedTextThisTurn = false;

	render(event: AgentEvent, nowMs = Date.now()): null | string {
		if (event.type === 'assistant_delta') {
			if (event.kind === 'text') {
				this.streamedTextThisTurn = true;
				return event.chunk;
			}
			this.reasoningChars += event.chunk.length;
			if (this.lastReasoningLineAtMs === 0) {
				this.lastReasoningLineAtMs = nowMs;
				return '[reasoning…]\n';
			}
			if (nowMs - this.lastReasoningLineAtMs >= REASONING_LINE_INTERVAL_MS) {
				this.lastReasoningLineAtMs = nowMs;
				return `[reasoning… ${formatReasoningChars(this.reasoningChars)} chars]\n`;
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
		return renderNativeRunLogLine(event);
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
			const meta = event.meta === undefined ? '' : `: ${String(event.meta)}`;
			return `[error] ${event.reason}${meta}\n`;
		}
		case 'idle_warning':
			return `[idle] no progress for ${Math.round(event.afterMs / 1000)}s\n`;
		case 'rate_limit':
			return `[rate-limit]${event.resetAt ? ` until ${event.resetAt}` : ''}\n`;
		case 'tool_call':
			return `${renderToolCall(event.tool, event.args)}\n`;
		default:
			return null;
	}
}
