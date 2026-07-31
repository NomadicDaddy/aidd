import type { AgentEvent } from 'aidd-shared/backends/types';

// Rendering caps: tool output and arg summaries are display material, not the archive (the raw
// view and "Copy all" keep the full transcript), so clamp them before they hit the DOM.
export const MAX_TOOL_OUTPUT_CHARS = 4000;
const MAX_ARGS_SUMMARY_CHARS = 200;
const MAX_NOTE_CHARS = 500;

export function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	return value as Record<string, unknown>;
}

export function truncate(text: string, max: number): { text: string; truncated: boolean } {
	if (text.length <= max) return { text, truncated: false };
	return { text: `${text.slice(0, max)}…`, truncated: true };
}

// Interleaved process output (e.g. Pester writing straight to the log) carries ANSI color/cursor
// sequences that render as "[91m" garbage in HTML; strip CSI sequences and stray escapes. The
// pattern is assembled from a char code so the source holds no control bytes (no-control-regex).
const ESC = String.fromCharCode(27);
const ANSI_PATTERN = new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]|${ESC}`, 'g');

export function stripAnsi(text: string): string {
	return text.replace(ANSI_PATTERN, '');
}

export function stringify(value: unknown): string {
	if (typeof value === 'string') return value;
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

// The first arg field that identifies what a tool call is doing, for non-command tools
// (claude-code style tool_use blocks carry file_path/pattern/url style inputs).
const titleArgKeys = ['file_path', 'path', 'pattern', 'url', 'query', 'description'] as const;

export function describeToolCall(tool: string, args: unknown): { detail?: string; title: string } {
	const record = asRecord(args);
	const command = typeof record?.command === 'string' ? record.command : undefined;
	if (command !== undefined) {
		const cwd = typeof record?.cwd === 'string' ? record.cwd : undefined;
		return { title: command, ...(cwd === undefined ? {} : { detail: `cwd ${cwd}` }) };
	}
	if (record !== undefined) {
		for (const key of titleArgKeys) {
			const value = record[key];
			if (typeof value === 'string' && value.length > 0) {
				return { title: `${tool} ${value}` };
			}
		}
		if (Object.keys(record).length > 0) {
			return {
				detail: truncate(stringify(record), MAX_ARGS_SUMMARY_CHARS).text,
				title: tool,
			};
		}
	}
	return { title: tool };
}

function formatTokens(count: number): string {
	return count.toLocaleString('en-US');
}

export function formatUsage(event: { type: 'usage' } & AgentEvent): string {
	const parts: string[] = [];
	if (event.inputTokens !== undefined) parts.push(`${formatTokens(event.inputTokens)} in`);
	if (event.cachedTokens !== undefined) {
		parts.push(`${formatTokens(event.cachedTokens)} cached`);
	}
	if (event.outputTokens !== undefined) parts.push(`${formatTokens(event.outputTokens)} out`);
	if (event.reasoningTokens !== undefined) {
		parts.push(`${formatTokens(event.reasoningTokens)} reasoning`);
	}
	if (event.costUsd !== undefined) {
		parts.push(event.costUsd < 0.01 ? '<$0.01' : `$${event.costUsd.toFixed(2)}`);
	}
	return `tokens: ${parts.join(' · ')}`;
}

export function noteText(meta: unknown): string {
	const record = asRecord(meta);
	const advisory = typeof record?.advisory === 'string' ? record.advisory : undefined;
	const message = typeof record?.message === 'string' ? record.message : undefined;
	const nested = asRecord(record?.error);
	const nestedMessage = typeof nested?.message === 'string' ? nested.message : undefined;
	const text = advisory ?? message ?? nestedMessage ?? stringify(meta ?? 'Unknown error');
	return truncate(text, MAX_NOTE_CHARS).text;
}
