import type { AgentEvent } from '../types.ts';

/**
 * Reader half of `cli/src/orchestrator/native-run-log.ts`.
 *
 * Every other backend writes a machine-readable NDJSON transcript that the console parses into
 * structured entries. The native backend has no subprocess and therefore no stdout: its run log is
 * text the CLI renders from the very AgentEvents the console wants back. Without this parser the
 * one backend aidd fully owns is also the only one whose console degrades to undifferentiated raw
 * text — no tool calls, no commands, no errors.
 *
 * The rendered grammar is small and stable; `test/shared/native-console-parser.test.ts` round-trips
 * renderer output through this parser so the two halves cannot drift apart silently.
 */

// Renderer prefixes for named tools, e.g. `→ read src/index.ts`. Anything else after `→ ` is
// rendered as `→ <tool> <summary>` and parsed by splitting on the first space.
const TOOL_VERBS: Record<string, string> = {
	edit: 'edit_file',
	list: 'list_directory',
	read: 'read_file',
	write: 'write_file',
};

// `[reasoning… 12.4k chars]` is a throttled liveness marker, not transcript. Dropping it keeps the
// pretty view free of progress noise the raw view still shows.
const REASONING_LINE = /^\[reasoning…/;

/**
 * A native run log interleaves aidd's structural lines with model prose written verbatim, so prose
 * beginning with a structural marker reads back as evidence aidd never observed: an explanation
 * whose line starts `$ rm -rf build` becomes a command in the run's audit trail, and one starting
 * `[done] ` is discarded as bookkeeping. The writer indents such a prose line by one space and this
 * strips it back off. Only prose is ever escaped, so a structural line never starts with a space
 * and stays unambiguous.
 *
 * The class of markers is matched loosely (`$`, `→`, `[` — no trailing space required) because the
 * writer escapes streamed text that may split mid-marker across two deltas.
 */
const AMBIGUOUS_LINE_START = /^ *[$→[]/;

export function escapeNativeLogLine(line: string): string {
	return AMBIGUOUS_LINE_START.test(line) ? ` ${line}` : line;
}

function unescapedProse(line: string): string | undefined {
	if (!line.startsWith(' ') || !AMBIGUOUS_LINE_START.test(line.slice(1))) return undefined;
	return line.slice(1);
}

function toolCall(tool: string, summary: string): AgentEvent {
	// bash is the only tool whose summary is a command; the rest summarize to a path or pattern.
	const args = tool === 'bash' ? { command: summary } : { path: summary };
	return { args, tool, type: 'tool_call' };
}

/**
 * Parse one line of a native run log. Unrecognized lines are assistant narration — the renderer
 * writes model text verbatim — and become text deltas so consecutive lines merge into one entry
 * rather than one entry per line.
 */
export function parseNativeLine(line: string): AgentEvent[] {
	if (line.length === 0) return [];
	const prose = unescapedProse(line);
	if (prose !== undefined)
		return [{ chunk: `${prose}\n`, kind: 'text', type: 'assistant_delta' }];
	if (REASONING_LINE.test(line)) return [];

	if (line.startsWith('$ ')) return [toolCall('bash', line.slice(2))];

	if (line.startsWith('→ ')) {
		const rest = line.slice(2);
		const space = rest.indexOf(' ');
		if (space === -1) return [toolCall(rest, '')];
		const verb = rest.slice(0, space);
		return [toolCall(TOOL_VERBS[verb] ?? verb, rest.slice(space + 1))];
	}

	if (line.startsWith('[denied] ')) {
		return [{ result: line.slice('[denied] '.length), tool: 'bash', type: 'tool_result' }];
	}

	if (line.startsWith('[error] ')) {
		return [
			{ fatal: true, meta: line.slice('[error] '.length), reason: 'unknown', type: 'error' },
		];
	}

	if (line.startsWith('[rate-limit]')) {
		const resetAt = line
			.slice('[rate-limit]'.length)
			.replace(/^ until /, '')
			.trim();
		return [{ raw: line, type: 'rate_limit', ...(resetAt.length > 0 ? { resetAt } : {}) }];
	}

	// `[done] exit N` and `[idle] …` are run bookkeeping the entry builder discards anyway; drop
	// them here so they do not render as narration.
	if (line.startsWith('[done] ') || line.startsWith('[idle] ')) return [];

	return [{ chunk: `${line}\n`, kind: 'text', type: 'assistant_delta' }];
}
