import type { AgentEvent } from 'aidd-shared/backends/types';

import { createClineBackendParser } from 'aidd-shared/backends/parsers/cline';
import { parseCodexBackendLine } from 'aidd-shared/backends/parsers/codex';
import { parseGrokLine } from 'aidd-shared/backends/parsers/grok';
import { parseOpencodeFamilyLine } from 'aidd-shared/backends/parsers/opencode-family';
import { parsePlainBackendLine } from 'aidd-shared/backends/parsers/plain';

import { asRecord } from './consoleEntryText.ts';

export interface ConsoleLineParser {
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
	if (backend === 'codex') {
		return {
			ownsLine: (json) =>
				typeof json.type === 'string' && /^(item\.|turn\.|thread\.|error$)/.test(json.type),
			parseLine: parseCodexBackendLine,
		};
	}
	if (backend === 'grok') {
		return {
			ownsLine: (json) =>
				json.type === 'thought' || json.type === 'text' || json.type === 'end',
			parseLine: parseGrokLine,
		};
	}
	if (backend === 'kilocode' || backend === 'opencode') {
		return {
			ownsLine: (json) =>
				(typeof json.type === 'string' &&
					['error', 'step_finish', 'text', 'tool_use'].includes(json.type)) ||
				asRecord(json.part)?.error !== undefined,
			parseLine: parseOpencodeFamilyLine,
		};
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
			parseLine: parser.parseLine,
		};
	}
	return { parseLine: parsePlainBackendLine };
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
