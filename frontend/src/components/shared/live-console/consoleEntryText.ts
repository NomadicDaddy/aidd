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

/**
 * Read a shell command the way a shell would, collapsing the escapes its quoting added. Codex
 * renders each exec item's argv as one shell-quoted display string, so on Windows every command
 * arrives behind a doubled program path — `"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command
 * …` — and inner paths double too. `\\` and `\"` collapse everywhere except inside single quotes,
 * which no shell escapes into; the raw view still holds the untouched transcript.
 */
export function unescapeShellQuotes(command: string): string {
	if (!command.includes('\\')) return command;
	let result = '';
	let quote: '"' | "'" | undefined;
	for (let index = 0; index < command.length; index++) {
		const character = command.charAt(index);
		if (quote !== "'" && character === '\\') {
			const next = command.charAt(index + 1);
			// An escaped quote is content, so it must not flip the quoting state below.
			if (next === '\\' || next === '"') {
				result += next;
				index++;
				continue;
			}
		}
		if (character === '"' || character === "'") {
			quote = quote === character ? undefined : (quote ?? character);
		}
		result += character;
	}
	return result;
}

type ShellLabel = 'bash' | 'cmd' | 'powershell' | 'pwsh' | 'sh';

function shellInvocation(command: string): { executable: string; remainder: string } | undefined {
	const quote = command.charAt(0);
	if (quote === '"' || quote === "'") {
		const closingQuote = command.indexOf(quote, 1);
		if (closingQuote === -1 || !/\s/.test(command.charAt(closingQuote + 1))) return undefined;
		return {
			executable: command.slice(1, closingQuote),
			remainder: command.slice(closingQuote + 1).trimStart(),
		};
	}
	const separator = command.search(/\s/);
	if (separator === -1) return undefined;
	return {
		executable: command.slice(0, separator),
		remainder: command.slice(separator).trimStart(),
	};
}

function shellLabel(executable: string): ShellLabel | undefined {
	const basename = executable.replaceAll('\\', '/').split('/').at(-1);
	if (basename === undefined) return undefined;
	const normalized = basename.replace(/\.exe$/i, '').toLowerCase();
	if (
		normalized === 'bash' ||
		normalized === 'cmd' ||
		normalized === 'powershell' ||
		normalized === 'pwsh' ||
		normalized === 'sh'
	) {
		return normalized;
	}
	return undefined;
}

function shellPayload(shell: ShellLabel, remainder: string): string | undefined {
	if (shell === 'pwsh' || shell === 'powershell') {
		return /^-command\s+([\s\S]+)$/i.exec(remainder)?.[1];
	}
	if (shell === 'cmd') return /^\/c\s+([\s\S]+)$/i.exec(remainder)?.[1];
	return /^-(?:c|lc)\s+([\s\S]+)$/.exec(remainder)?.[1];
}

function removeOuterQuotes(payload: string): string | undefined {
	const quote = payload.charAt(0);
	if (quote !== '"' && quote !== "'") return payload;
	if (!payload.endsWith(quote)) return undefined;
	const inner = payload.slice(1, -1);
	// After backend unescaping, balanced nested quotes appear in pairs; an odd count means the
	// apparent final delimiter belongs to malformed or ambiguous input, so keep the whole wrapper.
	const innerQuoteCount = [...inner].filter((character) => character === quote).length;
	return innerQuoteCount % 2 === 0 ? inner : undefined;
}

/**
 * Collapse a shell whose only job is to launch one command into a compact Pretty-view label.
 * Unknown executables, extra wrapper options, and incomplete quoting stay verbatim; Raw and Copy
 * all never call this formatter and retain the source transcript.
 */
export function formatCommandTitle(command: string): string {
	const readable = unescapeShellQuotes(command);
	const invocation = shellInvocation(readable);
	if (invocation === undefined) return readable;
	const shell = shellLabel(invocation.executable);
	if (shell === undefined) return readable;
	const wrappedPayload = shellPayload(shell, invocation.remainder);
	if (wrappedPayload === undefined) return readable;
	const payload = removeOuterQuotes(wrappedPayload);
	return payload === undefined || payload.length === 0 ? readable : '[' + shell + '] ' + payload;
}

export function describeToolCall(tool: string, args: unknown): { detail?: string; title: string } {
	const record = asRecord(args);
	const command = typeof record?.command === 'string' ? record.command : undefined;
	if (command !== undefined) {
		const cwd = typeof record?.cwd === 'string' ? record.cwd : undefined;
		return {
			title: formatCommandTitle(command),
			...(cwd === undefined ? {} : { detail: `cwd ${cwd}` }),
		};
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
