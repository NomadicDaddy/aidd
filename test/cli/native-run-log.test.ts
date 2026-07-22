import { describe, expect, test } from 'bun:test';
import type { AgentEvent } from 'aidd-shared/backends/types';
import {
	NativeRunLogRenderer,
	renderNativeRunLogLine,
} from '../../cli/src/orchestrator/native-run-log.ts';

describe('renderNativeRunLogLine', () => {
	test('renders assistant narration verbatim', () => {
		const event: AgentEvent = { type: 'assistant_text', chunk: 'Reviewing the auth guard.' };
		expect(renderNativeRunLogLine(event)).toBe('Reviewing the auth guard.\n');
	});

	test('collapses a large AIDD_RESULT payload to a compact note', () => {
		const event: AgentEvent = {
			type: 'assistant_text',
			chunk: 'Done. AIDD_RESULT: {"auditReports":[{"auditName":"SECURITY","reportMarkdown":"# big"}]}',
		};
		expect(renderNativeRunLogLine(event)).toBe('Done.\nAIDD_RESULT: { … }\n');
	});

	test('summarizes bash tool calls with the command', () => {
		const event: AgentEvent = {
			type: 'tool_call',
			tool: 'bash',
			args: { command: 'git log --oneline -10' },
		};
		expect(renderNativeRunLogLine(event)).toBe('$ git log --oneline -10\n');
	});

	test('summarizes file tool calls with the path', () => {
		const event: AgentEvent = {
			type: 'tool_call',
			tool: 'read_file',
			args: { path: 'backend/src/logger.ts' },
		};
		expect(renderNativeRunLogLine(event)).toBe('→ read backend/src/logger.ts\n');
	});

	test('renders errors with reason and meta', () => {
		const event: AgentEvent = { type: 'error', reason: 'provider', meta: 'boom' };
		expect(renderNativeRunLogLine(event)).toBe('[error] provider: boom\n');
	});

	test('renders run completion with the exit code', () => {
		const event: AgentEvent = { type: 'done', exitCode: 0, filesModified: [] };
		expect(renderNativeRunLogLine(event)).toBe('[done] exit 0\n');
	});

	test('skips noise events that would clutter the console', () => {
		expect(renderNativeRunLogLine({ type: 'usage', inputTokens: 10 })).toBeNull();
		expect(renderNativeRunLogLine({ type: 'started', backend: 'native' })).toBeNull();
		expect(renderNativeRunLogLine({ type: 'assistant_text', chunk: '   ' })).toBeNull();
	});
});

describe('NativeRunLogRenderer', () => {
	test('passes streamed text deltas through verbatim', () => {
		const renderer = new NativeRunLogRenderer();
		expect(
			renderer.render({ chunk: 'Reviewing the ', kind: 'text', type: 'assistant_delta' })
		).toBe('Reviewing the ');
		expect(
			renderer.render({ chunk: 'auth guard.\n', kind: 'text', type: 'assistant_delta' })
		).toBe('auth guard.\n');
	});

	test('suppresses the turn-final assistant_text after its content streamed as deltas', () => {
		const renderer = new NativeRunLogRenderer();
		renderer.render({ chunk: 'Done.\n', kind: 'text', type: 'assistant_delta' });
		expect(renderer.render({ chunk: 'Done.', type: 'assistant_text' })).toBeNull();
		// Next turn without deltas renders normally again.
		expect(renderer.render({ chunk: 'Second turn.', type: 'assistant_text' })).toBe(
			'Second turn.\n'
		);
	});

	test('keeps suppression across passive events between the last delta and assistant_text', () => {
		const renderer = new NativeRunLogRenderer();
		renderer.render({ chunk: 'Done.\n', kind: 'text', type: 'assistant_delta' });
		expect(renderer.render({ type: 'usage', inputTokens: 10 })).toBeNull();
		expect(renderer.render({ chunk: 'Done.', type: 'assistant_text' })).toBeNull();
	});

	test('collapses reasoning deltas into a throttled liveness line', () => {
		const renderer = new NativeRunLogRenderer();
		const reasoning = (chunk: string, nowMs: number) =>
			renderer.render({ chunk, kind: 'reasoning', type: 'assistant_delta' }, nowMs);
		expect(reasoning('x'.repeat(500), 1_000)).toBe('[reasoning…]\n');
		// Inside the throttle window: no line, chars still accumulate.
		expect(reasoning('y'.repeat(700), 5_000)).toBeNull();
		expect(reasoning('z'.repeat(100), 16_500)).toBe('[reasoning… 1.3k chars]\n');
	});

	test('resets reasoning progress at turn boundaries', () => {
		const renderer = new NativeRunLogRenderer();
		renderer.render(
			{ chunk: 'x'.repeat(500), kind: 'reasoning', type: 'assistant_delta' },
			1_000
		);
		renderer.render({ args: { path: 'a.ts' }, tool: 'read_file', type: 'tool_call' });
		expect(
			renderer.render({ chunk: 'y', kind: 'reasoning', type: 'assistant_delta' }, 2_000)
		).toBe('[reasoning…]\n');
	});

	test('renders non-delta events through the turn-level renderer', () => {
		const renderer = new NativeRunLogRenderer();
		expect(
			renderer.render({ args: { command: 'bun test' }, tool: 'bash', type: 'tool_call' })
		).toBe('$ bun test\n');
	});
});
