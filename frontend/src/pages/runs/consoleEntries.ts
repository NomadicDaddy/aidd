import type { AgentEvent } from 'aidd-shared/backends/types';

import {
	asRecord,
	describeToolCall,
	formatUsage,
	MAX_TOOL_OUTPUT_CHARS,
	noteText,
	stringify,
	stripAnsi,
	truncate,
} from './consoleEntryText.ts';
import {
	createForeignLineParser,
	extractReasoningTexts,
	isForeignOwnedShape,
	selectParser,
} from './consoleParsers.ts';

export interface ToolConsoleEntry {
	/** Secondary line under the title, e.g. the command's working directory. */
	detail?: string;
	exitCode?: number;
	kind: 'tool';
	output?: string;
	outputTruncated?: boolean;
	title: string;
	tool: string;
}

export type ConsoleEntry =
	| { kind: 'note'; text: string; tone: 'error' | 'warning' }
	| { kind: 'raw'; text: string }
	| { kind: 'reasoning'; text: string }
	| { kind: 'text'; text: string }
	| { kind: 'usage'; text: string }
	| ToolConsoleEntry;

// JSON.parse never yields undefined, so undefined doubles as the "not JSON" sentinel.
function tryJson(line: string): unknown {
	try {
		return JSON.parse(line);
	} catch {
		return undefined;
	}
}

class EntryBuilder {
	readonly entries: ConsoleEntry[] = [];
	private readonly pendingTools: { entry: ToolConsoleEntry; pairId?: string }[] = [];
	private rawBuffer: string[] = [];
	// Streaming backends (grok) emit token-by-token assistant_delta events; buffer consecutive
	// chunks of one kind into a single entry instead of one entry per token.
	private deltaKind: 'reasoning' | 'text' | undefined;
	private deltaParts: string[] = [];

	private flushRaw(): void {
		if (this.rawBuffer.length === 0) return;
		this.entries.push({ kind: 'raw', text: this.rawBuffer.join('\n') });
		this.rawBuffer = [];
	}

	private flushDelta(): void {
		if (this.deltaKind === undefined) return;
		const kind = this.deltaKind;
		const text = this.deltaParts.join('').trim();
		this.deltaKind = undefined;
		this.deltaParts = [];
		if (text.length > 0) this.entries.push({ kind, text });
	}

	pushRawLine(line: string): void {
		this.flushDelta();
		this.rawBuffer.push(stripAnsi(line));
	}

	pushReasoning(text: string): void {
		this.flushRaw();
		this.flushDelta();
		this.entries.push({ kind: 'reasoning', text: text.trim() });
	}

	// Codex reports one failure at both the item and the turn level with identical text; a
	// repeat of the immediately preceding note adds noise, not information.
	private pushNote(tone: 'error' | 'warning', text: string): void {
		const last = this.entries[this.entries.length - 1];
		if (last?.kind === 'note' && last.tone === tone && last.text === text) return;
		this.entries.push({ kind: 'note', text, tone });
	}

	// Pairing: an explicit item id (codex) matches only its own call — commands can complete out
	// of start order, so a name-based fallback would swap outputs. Without an id, results attach
	// to the oldest unpaired same-tool call; an 'unknown' tool takes the most recent pending
	// call of any tool.
	private findPendingIndex(tool: string, pairId: string | undefined): number {
		if (pairId !== undefined) {
			return this.pendingTools.findIndex((pending) => pending.pairId === pairId);
		}
		const byTool = this.pendingTools.findIndex((pending) => pending.entry.tool === tool);
		if (byTool === -1 && tool === 'unknown') return this.pendingTools.length - 1;
		return byTool;
	}

	private attachToolResult(event: { type: 'tool_result' } & AgentEvent, pairId?: string): void {
		const index = this.findPendingIndex(event.tool, pairId);
		const output = truncate(stripAnsi(stringify(event.result ?? '')), MAX_TOOL_OUTPUT_CHARS);
		const target = index === -1 ? undefined : this.pendingTools.splice(index, 1)[0]?.entry;
		if (target === undefined) {
			this.entries.push({
				kind: 'tool',
				title: event.tool,
				tool: event.tool,
				...(event.exitCode === undefined ? {} : { exitCode: event.exitCode }),
				...(output.text.length === 0 ? {} : { output: output.text }),
				...(output.truncated ? { outputTruncated: true } : {}),
			});
			return;
		}
		if (event.exitCode !== undefined) target.exitCode = event.exitCode;
		if (output.text.length > 0) target.output = output.text;
		if (output.truncated) target.outputTruncated = true;
	}

	pushEvent(event: AgentEvent, pairId?: string): void {
		// started/done/idle events are runtime bookkeeping that line parsers do not emit from
		// transcripts; deltas are buffered and merged into single entries instead.
		if (
			event.type === 'started' ||
			event.type === 'done' ||
			event.type === 'idle_warning' ||
			event.type === 'raw_log'
		) {
			return;
		}
		if (event.type === 'assistant_delta') {
			this.flushRaw();
			if (this.deltaKind !== undefined && this.deltaKind !== event.kind) this.flushDelta();
			this.deltaKind = event.kind;
			this.deltaParts.push(event.chunk);
			return;
		}
		this.flushRaw();
		this.flushDelta();
		if (event.type === 'assistant_text') {
			const text = event.chunk.trim();
			if (text.length > 0) this.entries.push({ kind: 'text', text });
			return;
		}
		if (event.type === 'tool_call') {
			const entry: ToolConsoleEntry = {
				kind: 'tool',
				tool: event.tool,
				...describeToolCall(event.tool, event.args),
			};
			this.entries.push(entry);
			this.pendingTools.push({ entry, ...(pairId === undefined ? {} : { pairId }) });
			return;
		}
		if (event.type === 'tool_result') {
			this.attachToolResult(event, pairId);
			return;
		}
		if (event.type === 'usage') {
			this.entries.push({ kind: 'usage', text: formatUsage(event) });
			return;
		}
		if (event.type === 'rate_limit') {
			const suffix = event.resetAt === undefined ? '' : ` (resets ${event.resetAt})`;
			this.pushNote('warning', `Rate limited by the provider${suffix}`);
			return;
		}
		this.pushNote(event.fatal === false ? 'warning' : 'error', noteText(event.meta));
	}

	finish(): ConsoleEntry[] {
		this.flushRaw();
		this.flushDelta();
		return this.entries;
	}
}

/**
 * Turn a raw run transcript (backend NDJSON, tagged lines, or plain text) into renderable
 * console entries using the shared per-backend line parsers. Lines the parser recognizes but
 * deliberately ignores (turn framing, todo lists) are dropped; lines that are not JSON at all
 * fall through as raw text so plain-text logs and stray stderr stay visible.
 */
export function parseConsoleEntries(
	text: string,
	backend: null | string | undefined,
): ConsoleEntry[] {
	const parser = selectParser(backend);
	const foreign = createForeignLineParser();
	const builder = new EntryBuilder();
	for (const line of text.split(/\r?\n/)) {
		if (!line.trim()) continue;
		let events: AgentEvent[];
		try {
			events = parser.parseLine(line);
		} catch {
			events = [];
		}
		const parsed = tryJson(line);
		const json = asRecord(parsed);
		// Reasoning precedes the same line's other events (thinking blocks come before the
		// response text in claude-code content arrays).
		const reasoningTexts = extractReasoningTexts(json);
		for (const reasoning of reasoningTexts) builder.pushReasoning(reasoning);
		// JSON this transcript's own parser does not claim is foreign — a triumvirate stage that
		// ran another backend — so it gets routed across the other parsers rather than dropped.
		// A parser with no ownsLine (claude-code, native) claims nothing, so its unrecognized JSON
		// is foreign too; gating this on `ownsLine !== undefined` is what left claude-code-primary
		// transcripts with no foreign handling at all. Reasoning-bearing lines are excluded to
		// avoid re-emitting text already pushed above.
		//
		// Producing events is not enough for such a parser to keep the line: both of them answer
		// for anything (plain takes any `.text`, native renders the unrecognized as prose), so a
		// line whose shape a real backend parser recognizes goes to that parser instead. Otherwise
		// plain swallowed cline's `run_result` and lost the usage attached to it, and native
		// rendered whole foreign stages as raw JSON.
		if (
			json !== undefined &&
			reasoningTexts.length === 0 &&
			parser.ownsLine?.(json) !== true &&
			(events.length === 0 || (parser.ownsLine === undefined && isForeignOwnedShape(json)))
		) {
			try {
				events = foreign.parseLine(line, json);
			} catch {
				events = [];
			}
		}
		if (events.length === 0) {
			if (parsed === undefined && !parser.dropsUnparsedLines) builder.pushRawLine(line);
			continue;
		}
		const itemId = asRecord(json?.item)?.id;
		const pairId = typeof itemId === 'string' && itemId.length > 0 ? itemId : undefined;
		for (const event of events) builder.pushEvent(event, pairId);
	}
	// Foreign first: a foreign stage's withheld result belongs to output that appeared earlier in
	// the transcript than the primary backend's own closing answer.
	for (const event of foreign.finalize()) builder.pushEvent(event);
	for (const event of parser.finalize?.() ?? []) builder.pushEvent(event);
	return builder.finish();
}

/** Searchable text for find-in-console filtering in the pretty view. */
export function entrySearchText(entry: ConsoleEntry): string {
	if (entry.kind === 'tool') {
		return [entry.title, entry.detail, entry.output].filter(Boolean).join('\n');
	}
	return entry.text;
}
