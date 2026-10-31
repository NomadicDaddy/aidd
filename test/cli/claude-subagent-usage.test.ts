import { describe, expect, test } from 'bun:test';
import { parsePlainBackendOutput } from 'aidd-shared/backends/parsers/plain';

interface Sum {
	cached: number;
	cost: number;
	input: number;
	output: number;
}

function sumUsage(stdout: string): Sum {
	const sum: Sum = { cached: 0, cost: 0, input: 0, output: 0 };
	for (const event of parsePlainBackendOutput(stdout, '', 0)) {
		if (event.type !== 'usage') continue;
		sum.cached += event.cachedTokens ?? 0;
		sum.cost += event.costUsd ?? 0;
		sum.input += event.inputTokens ?? 0;
		sum.output += event.outputTokens ?? 0;
	}
	return sum;
}

function assistant(id: string, parent: null | string, usage: Record<string, number>): string {
	return JSON.stringify({
		message: { content: [{ text: 'x', type: 'text' }], id, usage },
		parent_tool_use_id: parent,
		type: 'assistant',
	});
}

const mainMessage = assistant('msg_main', null, {
	cache_creation_input_tokens: 100,
	cache_read_input_tokens: 900,
	input_tokens: 10,
	output_tokens: 1,
});
const subagentMessage = assistant('msg_sub', 'toolu_agent', {
	cache_creation_input_tokens: 200,
	cache_read_input_tokens: 4800,
	input_tokens: 20,
	output_tokens: 1,
});
// `usage` on the result covers the main thread only, as measured on real runs: a run that used
// subagents reported 37,050 output tokens there and 202,713 in `modelUsage`.
const mainThreadUsage = {
	cache_creation_input_tokens: 100,
	cache_read_input_tokens: 900,
	input_tokens: 10,
	output_tokens: 300,
};

describe('claude-code usage with subagents', () => {
	test('takes session totals from modelUsage, which includes subagents', () => {
		const stdout = [
			mainMessage,
			subagentMessage,
			JSON.stringify({
				modelUsage: {
					'claude-haiku': {
						cacheCreationInputTokens: 200,
						cacheReadInputTokens: 800,
						inputTokens: 5,
						outputTokens: 400,
					},
					'claude-opus': {
						cacheCreationInputTokens: 100,
						cacheReadInputTokens: 4900,
						inputTokens: 25,
						outputTokens: 500,
					},
				},
				total_cost_usd: 1.5,
				type: 'result',
				usage: mainThreadUsage,
			}),
		].join('\n');

		expect(sumUsage(stdout)).toEqual({ cached: 5700, cost: 1.5, input: 6030, output: 900 });
	});

	test('adds session input that no streamed message reported', () => {
		const stdout = [
			mainMessage,
			JSON.stringify({
				modelUsage: {
					'claude-opus': {
						cacheCreationInputTokens: 300,
						cacheReadInputTokens: 5700,
						inputTokens: 30,
						outputTokens: 900,
					},
				},
				type: 'result',
				usage: mainThreadUsage,
			}),
		].join('\n');

		expect(sumUsage(stdout)).toMatchObject({ cached: 5700, input: 6030, output: 900 });
	});

	test('falls back to usage when the result has no modelUsage', () => {
		const stdout = [
			mainMessage,
			JSON.stringify({ total_cost_usd: 0.5, type: 'result', usage: mainThreadUsage }),
		].join('\n');

		expect(sumUsage(stdout)).toEqual({ cached: 900, cost: 0.5, input: 1010, output: 300 });
	});

	test('falls back to usage when modelUsage is empty', () => {
		const stdout = [
			mainMessage,
			JSON.stringify({ modelUsage: {}, type: 'result', usage: mainThreadUsage }),
		].join('\n');

		expect(sumUsage(stdout)).toMatchObject({ cached: 900, input: 1010, output: 300 });
	});

	test('keeps usage when modelUsage has entries it cannot read', () => {
		const stdout = [
			mainMessage,
			JSON.stringify({
				modelUsage: { 'claude-opus': { renamedOutput: 900 } },
				total_cost_usd: 0.5,
				type: 'result',
				usage: mainThreadUsage,
			}),
		].join('\n');

		expect(sumUsage(stdout)).toEqual({ cached: 900, cost: 0.5, input: 1010, output: 300 });
	});

	test('a run that dies before its result keeps the streamed prompt tokens', () => {
		const stdout = [mainMessage, subagentMessage].join('\n');

		expect(sumUsage(stdout)).toMatchObject({ cached: 5700, input: 6030, output: 0 });
	});
});
