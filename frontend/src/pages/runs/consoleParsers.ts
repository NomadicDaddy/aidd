import type { AgentEvent } from 'aidd-shared/backends/types';

import { createClineBackendParser } from 'aidd-shared/backends/parsers/cline';
import { parseCodexBackendLine } from 'aidd-shared/backends/parsers/codex';
import { parseGrokLine } from 'aidd-shared/backends/parsers/grok';
import { parseNativeLine } from 'aidd-shared/backends/parsers/native';
import { parseOpencodeFamilyLine } from 'aidd-shared/backends/parsers/opencode-family';
import { createPlainBackendParser } from 'aidd-shared/backends/parsers/plain';

import { asRecord } from './consoleEntryText.ts';

type OwnsLine = (json: Record<string, unknown>) => boolean;

const ownsCodexLine: OwnsLine = (json) =>
	typeof json.type === 'string' && /^(item\.|turn\.|thread\.|error$)/.test(json.type);
// Grok's deltas carry their payload in `data`; the OpenCode family also uses `{"type":"text"}` but
// puts the payload in `part`. Matching on the type alone made grok claim OpenCode's text envelopes
// and, claiming them, suppress the foreign fallback that would have rendered them.
const ownsGrokLine: OwnsLine = (json) =>
	((json.type === 'thought' || json.type === 'text') && typeof json.data === 'string') ||
	json.type === 'end';
const ownsOpencodeFamilyLine: OwnsLine = (json) =>
	(typeof json.type === 'string' &&
		['error', 'step_finish', 'text', 'tool_use'].includes(json.type)) ||
	asRecord(json.part)?.error !== undefined;
// `run_result` is the case that matters: cline withholds it until finalize, so it is owned-and-
// silent. Treating it as foreign fed it to the plain parser, which re-emitted the same answer and
// usage the finalize pass was already holding.
const ownsClineLine: OwnsLine = (json) =>
	typeof json.type === 'string' &&
	['agent_event', 'ask', 'error', 'run_result', 'say'].includes(json.type);

export interface ConsoleLineParser {
	/**
	 * True when the parser recognizes every line the backend can produce, so a line yielding no
	 * events was deliberately dropped rather than unrecognized. Only aidd's own native run log
	 * qualifies — aidd writes both halves of that format — and without this its dropped liveness
	 * markers (`[reasoning… 12.4k chars]`) reappear as raw entries in the pretty view.
	 */
	dropsUnparsedLines?: boolean;
	/** Present for stateful parsers (cline) that withhold the final answer until the end. */
	finalize?: () => AgentEvent[];
	/**
	 * True for envelope types native to this backend's stream. Owned lines that yield no events
	 * were deliberately ignored (turn framing, todo lists) and must NOT fall back to the plain
	 * parser; unowned JSON lines are foreign (e.g. a triumvirate stage that ran another backend)
	 * and get a best-effort plain parse so their output is not silently dropped.
	 */
	ownsLine?: (json: Record<string, unknown>) => boolean;
	parseLine: (line: string) => AgentEvent[];
}

export function selectParser(backend: null | string | undefined): ConsoleLineParser {
	if (backend === 'codex') return { ownsLine: ownsCodexLine, parseLine: parseCodexBackendLine };
	if (backend === 'grok') return { ownsLine: ownsGrokLine, parseLine: parseGrokLine };
	if (backend === 'kilocode' || backend === 'opencode') {
		return { ownsLine: ownsOpencodeFamilyLine, parseLine: parseOpencodeFamilyLine };
	}
	if (backend === 'cline') {
		// Stateful across lines: a fresh instance per parse pass is correct because
		// parseConsoleEntries always consumes the transcript from the top. Cline withholds the
		// final answer + usage until finalize, so the console must run it; the neutral input
		// (exit 0, saw-everything, empty streams) suppresses finalizePlainBackend's raw-stdout
		// dump and synthetic-error fallbacks while letting the stored result surface.
		const parser = createClineBackendParser();
		return {
			finalize: () =>
				parser.finalize({
					exitCode: 0,
					sawAssistantText: true,
					sawRateLimit: true,
					stderr: '',
					stdout: '',
				}),
			ownsLine: ownsClineLine,
			parseLine: parser.parseLine,
		};
	}
	// The native backend has no subprocess transcript — its run log is text the CLI renders from
	// structured events, so the plain parser sees nothing it recognizes and the whole console
	// degrades to raw lines. parseNativeLine reads that rendering back.
	if (backend === 'native') return { dropsUnparsedLines: true, parseLine: parseNativeLine };
	// Stateful across lines (token reconciliation); a fresh instance per parse pass is correct
	// because parseConsoleEntries always consumes the transcript from the top.
	return { parseLine: createPlainBackendParser().parseLine };
}

/**
 * Every backend-specific parser, for lines a transcript's own parser does not claim. A triumvirate
 * recipe runs several backends and stores one transcript per run, so a codex-primary log can carry
 * whole stages of OpenCode or Kilo envelopes.
 *
 * Falling back to the plain parser alone (as this did) dropped those stages entirely: plain reads
 * claude-code stream-json, and a `{"type":"tool_use",...}` OpenCode envelope means nothing to it,
 * so the line yielded no events and no raw text either. The chain tries each parser that claims the
 * envelope shape and takes the first one to actually produce events — `{"type":"text"}` is claimed
 * by both grok and the OpenCode family, so matching the shape is not on its own enough to route.
 */
const FOREIGN_PARSERS: { ownsLine: OwnsLine; parseLine: (line: string) => AgentEvent[] }[] = [
	{ ownsLine: ownsCodexLine, parseLine: parseCodexBackendLine },
	{ ownsLine: ownsOpencodeFamilyLine, parseLine: parseOpencodeFamilyLine },
	{ ownsLine: ownsGrokLine, parseLine: parseGrokLine },
];

/**
 * Parse one line no primary parser claimed. Stateful (the plain fallback reconciles token usage
 * across a transcript), so callers hold one instance for a whole parse pass.
 */
export function createForeignLineParser(): (
	line: string,
	json: Record<string, unknown>,
) => AgentEvent[] {
	const plain = createPlainBackendParser();
	return (line, json) => {
		for (const candidate of FOREIGN_PARSERS) {
			if (!candidate.ownsLine(json)) continue;
			const events = candidate.parseLine(line);
			if (events.length > 0) return events;
		}
		return plain.parseLine(line);
	};
}

// The shared parsers deliberately drop model reasoning (transcripts and result parsing have no
// use for it), but the console does: surface codex reasoning items and claude-code thinking
// blocks as interstitials. Grok's thought deltas arrive as assistant_delta events instead and
// are merged by the entry builder.
export function extractReasoningTexts(json: Record<string, unknown> | undefined): string[] {
	if (json === undefined) return [];
	const texts: string[] = [];
	// codex: {"type":"item.completed","item":{"type":"reasoning","text":"…"}}. Completed only,
	// so the started envelope for the same item does not emit a duplicate.
	if (json.type === 'item.completed') {
		const item = asRecord(json.item);
		if (item?.type === 'reasoning' && typeof item.text === 'string') texts.push(item.text);
	}
	// claude-code: {"type":"assistant","message":{"content":[{"type":"thinking","thinking":"…"}]}}
	const content = asRecord(json.message)?.content ?? json.content;
	if (Array.isArray(content)) {
		for (const block of content) {
			const record = asRecord(block);
			if (record?.type === 'thinking' && typeof record.thinking === 'string') {
				texts.push(record.thinking);
			}
		}
	}
	return texts.filter((text) => text.trim().length > 0);
}
