import type { AgentEvent } from 'aidd-shared/backends/types';

import { parseNativeLine } from 'aidd-shared/backends/parsers/native';
import { describe, expect, test } from 'bun:test';

import {
	NativeRunLogRenderer,
	renderNativeRunLogLine,
} from '../../cli/src/orchestrator/native-run-log.ts';

// The native run log is text the CLI renders from AgentEvents rather than a backend's own NDJSON,
// so the console parser reads a format aidd itself writes. Round-tripping through the real renderer
// keeps the two halves from drifting apart silently.
function roundTrip(event: AgentEvent): AgentEvent[] {
	const rendered = renderNativeRunLogLine(event);
	if (rendered === null) return [];
	return rendered
		.split('\n')
		.filter((line) => line.length > 0)
		.flatMap(parseNativeLine);
}

describe('parseNativeLine', () => {
	test('recovers a bash tool call with its command', () => {
		expect(
			roundTrip({ args: { command: 'git status --short' }, tool: 'bash', type: 'tool_call' }),
		).toEqual([{ args: { command: 'git status --short' }, tool: 'bash', type: 'tool_call' }]);
	});

	test('recovers file tool calls under their real tool names', () => {
		expect(
			roundTrip({ args: { path: 'src/index.ts' }, tool: 'read_file', type: 'tool_call' }),
		).toEqual([{ args: { path: 'src/index.ts' }, tool: 'read_file', type: 'tool_call' }]);
		expect(
			roundTrip({ args: { path: 'README.md' }, tool: 'write_file', type: 'tool_call' }),
		).toEqual([{ args: { path: 'README.md' }, tool: 'write_file', type: 'tool_call' }]);
		expect(
			roundTrip({ args: { path: 'src' }, tool: 'list_directory', type: 'tool_call' }),
		).toEqual([{ args: { path: 'src' }, tool: 'list_directory', type: 'tool_call' }]);
	});

	test('keeps an unknown tool name intact', () => {
		expect(roundTrip({ args: { pattern: 'TODO' }, tool: 'grep', type: 'tool_call' })).toEqual([
			{ args: { path: 'TODO' }, tool: 'grep', type: 'tool_call' },
		]);
	});

	test('surfaces errors as error events rather than narration', () => {
		const events = roundTrip({ fatal: true, reason: 'unknown', type: 'error' });
		expect(events).toHaveLength(1);
		expect(events[0]?.type).toBe('error');
	});

	test('reports a rate limit with its reset time', () => {
		expect(roundTrip({ resetAt: '2026-07-31T19:00:00Z', type: 'rate_limit' })).toEqual([
			{
				raw: '[rate-limit] until 2026-07-31T19:00:00Z',
				resetAt: '2026-07-31T19:00:00Z',
				type: 'rate_limit',
			},
		]);
	});

	test('drops run bookkeeping instead of rendering it as assistant text', () => {
		expect(roundTrip({ exitCode: 0, filesModified: [], type: 'done' })).toEqual([]);
		expect(roundTrip({ afterMs: 120_000, type: 'idle_warning' })).toEqual([]);
		expect(parseNativeLine('[reasoning… 12.4k chars]')).toEqual([]);
	});

	test('treats narration as text deltas so consecutive lines merge into one entry', () => {
		expect(roundTrip({ chunk: 'Reviewing the auth guard.', type: 'assistant_text' })).toEqual([
			{ chunk: 'Reviewing the auth guard.\n', kind: 'text', type: 'assistant_delta' },
		]);
	});

	// Prose is the one part of this log aidd does not author, so it is the one part that can forge
	// the grammar. Each of these lines, written verbatim, would have read back as evidence of
	// something the model only talked about.
	test('prose that looks structural round-trips as prose, not as evidence', () => {
		const lines = [
			'$ rm -rf build',
			'→ read secrets.env',
			'[done] exit 0',
			'[idle] no progress for 120s',
			'[error] provider_flagged',
			'[denied] rm -rf /',
			'[reasoning… 9.9k chars]',
			'  $ indented example',
		];
		for (const line of lines) {
			expect(roundTrip({ chunk: line, type: 'assistant_text' })).toEqual([
				{ chunk: `${line.trim()}\n`, kind: 'text', type: 'assistant_delta' },
			]);
		}
	});

	test('streamed prose is escaped across delta boundaries and closes its line for a marker', () => {
		const renderer = new NativeRunLogRenderer();
		// A marker split across two deltas, then a real tool call arriving mid-line.
		const written = [
			renderer.render({ chunk: 'Never run:\n$', kind: 'text', type: 'assistant_delta' }),
			renderer.render({ chunk: ' rm -rf /\nthen ', kind: 'text', type: 'assistant_delta' }),
			renderer.render({ args: { command: 'bun test' }, tool: 'bash', type: 'tool_call' }),
		].join('');
		const events = written
			.split('\n')
			.filter((line) => line.length > 0)
			.flatMap(parseNativeLine);
		expect(events).toEqual([
			{ chunk: 'Never run:\n', kind: 'text', type: 'assistant_delta' },
			{ chunk: '$ rm -rf /\n', kind: 'text', type: 'assistant_delta' },
			{ chunk: 'then \n', kind: 'text', type: 'assistant_delta' },
			{ args: { command: 'bun test' }, tool: 'bash', type: 'tool_call' },
		]);
	});

	test('keeps a denied command visible as a tool result', () => {
		const events = parseNativeLine('[denied] rm -rf / (outside the workspace)');
		expect(events).toEqual([
			{ result: 'rm -rf / (outside the workspace)', tool: 'bash', type: 'tool_result' },
		]);
	});
});
