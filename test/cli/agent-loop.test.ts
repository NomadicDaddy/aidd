import { describe, expect, test } from 'bun:test';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { runAgentLoop } from 'aidd-shared/agent/loop';
import type { AgentClient, AgentLoopRequest } from 'aidd-shared/agent/client';
import type { AgentEvent, PromptInput } from 'aidd-shared/backends/types';

import { testTempDir } from '../_helpers/temp.ts';
const input: PromptInput = {
	text: 'Implement the selected feature.',
	cwd: 'D:/applications/demo',
	model: 'test-model',
	reasoningEffort: 'low',
	thinking: true,
	thinkingLevel: 'medium',
};

async function collect(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
	const events: AgentEvent[] = [];
	for await (const event of stream) {
		events.push(event);
	}
	return events;
}

function snapshotRequest(request: AgentLoopRequest): AgentLoopRequest {
	return structuredClone(request) as AgentLoopRequest;
}

describe('native agent loop', () => {
	test('emits normalized events from an injected client', async () => {
		const client: AgentClient = {
			async complete(request) {
				expect(request.prompt).toBe(input.text);
				expect(request.cwd).toBe(input.cwd);
				expect(request.model).toBe(input.model);
				expect(request.reasoningEffort).toBe(input.reasoningEffort);
				expect(request.thinking).toBe(input.thinking);
				expect(request.thinkingLevel).toBe(input.thinkingLevel);
				return {
					events: [{ type: 'tool_call', tool: 'read_file', args: { path: 'README.md' } }],
					text: 'AIDD_RESULT: {"status":"completed","passes":true}',
					inputTokens: 10,
					outputTokens: 20,
					filesModified: ['README.md'],
				};
			},
		};

		await expect(collect(runAgentLoop(input, { client }))).resolves.toEqual([
			{ type: 'tool_call', tool: 'read_file', args: { path: 'README.md' } },
			{ type: 'assistant_text', chunk: 'AIDD_RESULT: {"status":"completed","passes":true}' },
			{ type: 'usage', inputTokens: 10, outputTokens: 20 },
			{ type: 'done', exitCode: 0, filesModified: ['README.md'] },
		]);
	});

	test('streams client onDelta fragments as live assistant_delta events before the turn text', async () => {
		const client: AgentClient = {
			async complete(_request, _signal, onDelta) {
				onDelta?.({ kind: 'reasoning', text: 'weighing the options' });
				onDelta?.({ kind: 'text', text: 'Reviewing the selected feature now.' });
				return { text: 'Reviewing the selected feature now.' };
			},
		};

		const events = await collect(runAgentLoop(input, { client }));

		expect(events).toEqual([
			{ chunk: 'weighing the options', kind: 'reasoning', type: 'assistant_delta' },
			// Marker hold-back splits the narration; concatenated it is the full text + '\n'.
			{ chunk: 'Reviewing the selected f', kind: 'text', type: 'assistant_delta' },
			{ chunk: 'eature now.\n', kind: 'text', type: 'assistant_delta' },
			{ type: 'assistant_text', chunk: 'Reviewing the selected feature now.' },
			{ type: 'done', exitCode: 0, filesModified: [] },
		]);
	});

	test('gates a streamed AIDD_RESULT payload out of the live delta events', async () => {
		const marker = 'AIDD_RESULT: {"status":"completed","passes":true}';
		const client: AgentClient = {
			async complete(_request, _signal, onDelta) {
				onDelta?.({ kind: 'text', text: `All finished. ${marker.slice(0, 20)}` });
				onDelta?.({ kind: 'text', text: marker.slice(20) });
				return { text: `All finished. ${marker}` };
			},
		};

		const events = await collect(runAgentLoop(input, { client }));

		const deltaText = events
			.filter((event) => event.type === 'assistant_delta')
			.map((event) => (event.type === 'assistant_delta' ? event.chunk : ''))
			.join('');
		expect(deltaText).toBe('All finished.\nAIDD_RESULT: { … }\n');
		// The canonical full text (marker included) still arrives for result parsing.
		expect(events).toContainEqual({
			type: 'assistant_text',
			chunk: `All finished. ${marker}`,
		});
	});

	test('rejects empty prompts before calling the client', async () => {
		let called = false;
		const client: AgentClient = {
			async complete() {
				called = true;
				return { text: 'unused' };
			},
		};

		const events = await collect(runAgentLoop({ ...input, text: '   ' }, { client }));

		expect(called).toBe(false);
		expect(events).toEqual([
			{ type: 'error', reason: 'provider', meta: 'empty prompt' },
			{ type: 'done', exitCode: 8, filesModified: [] },
		]);
	});

	test('classifies a thrown provider content-flag refusal as provider_flagged', async () => {
		const flagged =
			'This content was flagged for possible cybersecurity risk. If this seems wrong, try rephrasing your request.';
		const client: AgentClient = {
			async complete() {
				throw new Error(flagged);
			},
		};

		const events = await collect(runAgentLoop(input, { client }));

		expect(events).toEqual([
			{ type: 'error', reason: 'provider_flagged', meta: flagged },
			{ type: 'done', exitCode: 8, filesModified: [] },
		]);
	});

	test('normalizes aborted runs', async () => {
		const controller = new AbortController();
		controller.abort('stop requested');

		await expect(collect(runAgentLoop(input, { signal: controller.signal }))).resolves.toEqual([
			{ type: 'error', reason: 'aborted', meta: 'stop requested' },
			{ type: 'done', exitCode: 6, filesModified: [] },
		]);
	});

	test('executes tool calls and feeds results into the next turn', async () => {
		const cwd = await testTempDir('aidd-native-tools-');
		const requests: AgentLoopRequest[] = [];
		const client: AgentClient = {
			async complete(request) {
				requests.push(snapshotRequest(request));
				if (requests.length === 1) {
					return {
						text: '',
						toolCalls: [
							{
								id: 'call_1',
								name: 'write_file',
								arguments: JSON.stringify({
									path: 'result.txt',
									content: 'tool output',
								}),
							},
						],
					};
				}
				return { text: 'done' };
			},
		};

		try {
			const events = await collect(
				runAgentLoop(
					{
						...input,
						cwd,
					},
					{ client },
				),
			);

			expect(await readFile(join(cwd, 'result.txt'), 'utf8')).toBe('tool output');
			expect(requests).toHaveLength(2);
			expect(requests[0]?.tools?.some((tool) => tool.function.name === 'write_file')).toBe(
				true,
			);
			expect(requests[1]?.messages?.at(-1)).toEqual({
				role: 'tool',
				toolCallId: 'call_1',
				content: `File written successfully: ${join(cwd, 'result.txt')}`,
			});
			expect(events).toContainEqual({
				type: 'tool_call',
				tool: 'write_file',
				args: { path: 'result.txt', content: 'tool output' },
			});
			expect(events).toContainEqual({
				type: 'tool_result',
				tool: 'write_file',
				result: `File written successfully: ${join(cwd, 'result.txt')}`,
			});
			expect(events.at(-1)).toEqual({
				type: 'done',
				exitCode: 0,
				filesModified: ['result.txt'],
			});
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});

	test('nudges hallucinated text-only actions and continues', async () => {
		const requests: AgentLoopRequest[] = [];
		const client: AgentClient = {
			async complete(request) {
				requests.push(snapshotRequest(request));
				if (requests.length === 1) {
					return { text: 'I created feature files.\n[result]\n[exit code: 0]' };
				}
				return { text: 'done' };
			},
		};

		const events = await collect(runAgentLoop(input, { client }));

		expect(requests).toHaveLength(2);
		expect(requests[1]?.messages?.at(-1)).toMatchObject({
			role: 'user',
			content: expect.stringContaining('did not actually call any tools'),
		});
		expect(events).toContainEqual({
			type: 'raw_log',
			stream: 'stdout',
			chunk: '[native] hallucinated_tool_results\n',
		});
		expect(events.at(-1)).toEqual({ type: 'done', exitCode: 0, filesModified: [] });
	});
});
