import { describe, expect, test } from 'bun:test';

import type { AgentEvent } from 'aidd-shared/backends/types';
import { extractMalformedResultMarker } from 'aidd-shared/agent/result-marker';
import { extractStructuredResult, metricsFromEvents } from 'aidd-shared/orchestrator/result';

describe('orchestrator result extraction', () => {
	test('uses the last valid AIDD_RESULT after compaction summary marker text', () => {
		const events: AgentEvent[] = [
			{
				type: 'assistant_text',
				chunk: [
					'This session is being continued from a previous conversation.',
					'The contract mentioned `AIDD_RESULT: {"featureId":"<id>","status":"completed","passes":true}`.',
					'Do not treat that quoted template as the completion marker.',
				].join('\n'),
			},
			{
				type: 'assistant_text',
				chunk: [
					'Committed cleanly.',
					'AIDD_RESULT: {"featureId":"corpus-readiness-check","status":"completed","passes":true}',
				].join('\n'),
			},
		];

		expect(extractStructuredResult(events)).toEqual({
			featureId: 'corpus-readiness-check',
			passes: true,
			status: 'completed',
		});
	});

	test('a trailing inline mention of the contract does not overwrite the real result', () => {
		const events: AgentEvent[] = [
			{
				type: 'assistant_text',
				chunk: [
					'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}',
					'',
					'For reference, the contract shape is AIDD_RESULT: {"featureId": "<id>", "status": "completed"} .',
				].join('\n'),
			},
		];

		expect(extractStructuredResult(events)).toEqual({
			featureId: 'feature-core',
			passes: true,
			status: 'completed',
		});
	});

	test('a marker quoted inside the payload does not replace the payload', () => {
		const events: AgentEvent[] = [
			{
				type: 'assistant_text',
				chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true,"summary":"Handled the empty AIDD_RESULT: {} case"}',
			},
		];

		expect(extractStructuredResult(events)).toEqual({
			featureId: 'feature-core',
			passes: true,
			status: 'completed',
			summary: 'Handled the empty AIDD_RESULT: {} case',
		});
	});

	test('an indented marker inside a fenced block still counts', () => {
		const events: AgentEvent[] = [
			{
				type: 'assistant_text',
				chunk: [
					'Done.',
					'```text',
					'  AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}',
					'```',
				].join('\n'),
			},
		];

		expect(extractStructuredResult(events)).toEqual({
			featureId: 'feature-core',
			passes: true,
			status: 'completed',
		});
	});

	test('ignores malformed result markers before a valid final marker', () => {
		const events: AgentEvent[] = [
			{
				type: 'assistant_text',
				chunk: 'Earlier malformed marker: AIDD_RESULT: {"featureId":"feature-core",',
			},
			{
				type: 'assistant_text',
				chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}',
			},
		];

		expect(extractStructuredResult(events)).toEqual({
			featureId: 'feature-core',
			passes: true,
			status: 'completed',
		});
	});
});

describe('malformed result marker detection', () => {
	test('flags a brace-balanced placeholder body (unicode ellipsis)', () => {
		expect(extractMalformedResultMarker('All done.\nAIDD_RESULT: { \u2026 }')).toBe(true);
	});

	test('flags a brace-balanced placeholder body (ascii dots)', () => {
		expect(extractMalformedResultMarker('AIDD_RESULT: { ... }')).toBe(true);
	});

	test('does not flag a valid marker', () => {
		expect(
			extractMalformedResultMarker(
				'AIDD_RESULT: {"auditFindings":[],"noFindingsJustification":"inspected x","reportMarkdown":"# LICENSING\\n"}',
			),
		).toBe(false);
	});

	test('does not flag a truncated (unbalanced) marker', () => {
		expect(
			extractMalformedResultMarker(
				'AIDD_RESULT: {"auditReports":[{"auditName":"SECURITY","reportMarkdown":"# SECURITY',
			),
		).toBe(false);
	});

	test('does not flag mid-turn narration that mentions the marker inline', () => {
		// The nudge this feeds tells the agent "emit the corrected marker; nothing else is
		// required" — firing it on a model narrating its plan ends the turn with no work done.
		const text =
			"I'll add a guard for the placeholder AIDD_RESULT: { … } case. Next, update the tests.";
		expect(extractMalformedResultMarker(text)).toBe(false);
	});

	test('does not flag when a valid marker rescues an earlier malformed one', () => {
		const text =
			'AIDD_RESULT: { ... }\n' +
			'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}';
		expect(extractMalformedResultMarker(text)).toBe(false);
	});
});

describe('metricsFromEvents file-change counts', () => {
	test('excludes explicitly nonfatal diagnostics from error metrics', () => {
		const metrics = metricsFromEvents([
			{ fatal: false, reason: 'provider', type: 'error' },
			{ reason: 'provider', type: 'error' },
		]);

		expect(metrics.errorCount).toBe(1);
		expect(metrics.errorReasons).toEqual(['provider']);
	});

	test('counts unique edited and created files from tool calls', () => {
		const events: AgentEvent[] = [
			{ type: 'tool_call', tool: 'Edit', args: { file_path: 'src/a.ts' } },
			{ type: 'tool_call', tool: 'edit_file', args: { path: 'src/a.ts' } },
			{ type: 'tool_call', tool: 'str_replace', args: { file_path: 'src/b.ts' } },
			{ type: 'tool_call', tool: 'Write', args: { file_path: 'src/c.ts' } },
			{ type: 'tool_call', tool: 'create_file', args: { path: 'src/c.ts' } },
			{ type: 'tool_call', tool: 'Read', args: { file_path: 'src/d.ts' } },
			{ type: 'done', exitCode: 0, filesModified: [] },
		];

		const metrics = metricsFromEvents(events);

		expect(metrics.filesEditedCount).toBe(2);
		expect(metrics.filesCreatedCount).toBe(1);
		expect('filesModifiedCount' in metrics).toBe(false);
	});

	test('canonicalizes tool breakdown casing and aliases', () => {
		const events: AgentEvent[] = [
			{ type: 'tool_call', tool: 'Bash', args: { command: 'ls' } },
			{ type: 'tool_call', tool: 'bash', args: { command: 'pwd' } },
			{ type: 'tool_call', tool: 'shell', args: { command: 'whoami' } },
			{ type: 'tool_call', tool: 'read_file', args: { path: 'a.ts' } },
			{ type: 'tool_call', tool: 'Read', args: { file_path: 'b.ts' } },
			{ type: 'tool_call', tool: 'str_replace', args: { file_path: 'c.ts' } },
			{ type: 'tool_call', tool: 'Write', args: { file_path: 'd.ts' } },
			{ type: 'tool_call', tool: 'Grep', args: { pattern: 'x' } },
			{ type: 'done', exitCode: 0, filesModified: [] },
		];

		const metrics = metricsFromEvents(events);

		expect(metrics.toolBreakdown).toEqual({
			bash: 3,
			read: 2,
			edit: 1,
			write: 1,
			grep: 1,
		});
		expect(metrics.toolCallCount).toBe(8);
	});

	test('edited/created counts are independent of the backend done filesModified array', () => {
		const events: AgentEvent[] = [
			{ type: 'tool_call', tool: 'Edit', args: { file_path: 'src/only.ts' } },
			{ type: 'done', exitCode: 0, filesModified: ['x.ts', 'y.ts', 'z.ts'] },
		];

		const metrics = metricsFromEvents(events);

		expect(metrics.filesEditedCount).toBe(1);
		expect(metrics.filesCreatedCount).toBe(0);
	});

	test('accumulates cached and reasoning tokens from usage events', () => {
		const events: AgentEvent[] = [
			{
				cachedTokens: 1000,
				costUsd: 0.1,
				inputTokens: 10000,
				outputTokens: 500,
				reasoningTokens: 200,
				type: 'usage',
			},
			{
				cachedTokens: 500,
				costUsd: 0.05,
				inputTokens: 5000,
				outputTokens: 250,
				reasoningTokens: 100,
				type: 'usage',
			},
		];

		const metrics = metricsFromEvents(events);

		expect(metrics.inputTokens).toBe(15000);
		expect(metrics.outputTokens).toBe(750);
		expect(metrics.cachedTokens).toBe(1500);
		expect(metrics.reasoningTokens).toBe(300);
		expect(metrics.costUsd).toBeCloseTo(0.15, 6);
	});
});

describe('exitCodeFromEvents rate-limit classification', () => {
	test('a claude-code session-limit stream classifies as rateLimited (74), not provider (72)', async () => {
		const { exitCodeFromEvents, orchestratorExitCodes } =
			await import('aidd-shared/orchestrator/result');
		const { parsePlainBackendOutput } = await import('aidd-shared/backends/parsers/plain');
		const stdout = [
			JSON.stringify({
				type: 'rate_limit_event',
				rate_limit_info: { status: 'rejected', resetsAt: 1783550400 },
			}),
			JSON.stringify({
				type: 'result',
				is_error: true,
				api_error_status: 429,
				result: "You've hit your session limit · resets 5:40pm (America/Chicago)",
			}),
		].join('\n');
		const events = parsePlainBackendOutput(stdout, '', 1);
		expect(exitCodeFromEvents(events)).toBe(orchestratorExitCodes.rateLimited);
	});

	test('a trailing nonfatal advisory never outranks the real error behind it', async () => {
		const { exitCodeFromEvents, orchestratorExitCodes } =
			await import('aidd-shared/orchestrator/result');
		// A recognized-benign notice arriving after the genuine failure must not become the
		// classification just because it is the last error in the stream.
		const events: AgentEvent[] = [
			{ raw: 'limit', type: 'rate_limit' },
			{ meta: { message: 'throttled' }, reason: 'rate_limit', type: 'error' },
			{
				fatal: false,
				meta: { message: 'skills truncated' },
				reason: 'provider',
				type: 'error',
			},
			{ exitCode: 1, filesModified: [], type: 'done' },
		];
		expect(exitCodeFromEvents(events)).toBe(orchestratorExitCodes.rateLimited);
	});
});
