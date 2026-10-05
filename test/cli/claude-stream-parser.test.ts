import { describe, expect, test } from 'bun:test';
import { parsePlainBackendOutput } from 'aidd-shared/backends/parsers/plain';

function transcript(...lines: unknown[]): string {
	return lines.map((line) => JSON.stringify(line)).join('\n');
}

function assistantText(text: string): unknown {
	return { message: { content: [{ text, type: 'text' }] }, type: 'assistant' };
}

describe('claude-code closing result', () => {
	test('a result repeating the final message does not print the answer twice', () => {
		const answer = 'Done.\nAIDD_RESULT: {"featureId":"f","status":"completed","passes":true}';
		const events = parsePlainBackendOutput(
			transcript(assistantText(answer), {
				result: answer,
				subtype: 'success',
				type: 'result',
			}),
			'',
			0,
		);
		const texts = events.flatMap((event) =>
			event.type === 'assistant_text' ? [event.chunk] : [],
		);
		expect(texts).toEqual([answer]);
	});

	test('a result that adds something the stream did not still surfaces', () => {
		const events = parsePlainBackendOutput(
			transcript(assistantText('Working on it.'), {
				result: 'Finished the change.',
				subtype: 'success',
				type: 'result',
			}),
			'',
			0,
		);
		const texts = events.flatMap((event) =>
			event.type === 'assistant_text' ? [event.chunk] : [],
		);
		expect(texts).toEqual(['Working on it.', 'Finished the change.']);
	});

	test('a result with no message before it is the answer', () => {
		const events = parsePlainBackendOutput(
			transcript({ result: 'Only answer.', subtype: 'success', type: 'result' }),
			'',
			0,
		);
		const texts = events.flatMap((event) =>
			event.type === 'assistant_text' ? [event.chunk] : [],
		);
		expect(texts).toEqual(['Only answer.']);
	});
});

describe('claude-code tool results', () => {
	test('a result carries the name and id of the call it answers', () => {
		const events = parsePlainBackendOutput(
			transcript(
				{
					message: {
						content: [
							{
								id: 'toolu_a',
								input: { file_path: 'a.ts' },
								name: 'Read',
								type: 'tool_use',
							},
						],
					},
					type: 'assistant',
				},
				{
					message: {
						content: [
							{ content: 'file a', tool_use_id: 'toolu_a', type: 'tool_result' },
						],
					},
					type: 'user',
				},
				{
					message: {
						content: [
							{ content: 'orphan', tool_use_id: 'toolu_gone', type: 'tool_result' },
						],
					},
					type: 'user',
				},
			),
			'',
			0,
		);
		const tools = events.flatMap((event) =>
			event.type === 'tool_call' || event.type === 'tool_result'
				? [{ callId: event.callId, tool: event.tool, type: event.type }]
				: [],
		);
		expect(tools).toEqual([
			{ callId: 'toolu_a', tool: 'Read', type: 'tool_call' },
			{ callId: 'toolu_a', tool: 'Read', type: 'tool_result' },
			{ callId: 'toolu_gone', tool: 'unknown', type: 'tool_result' },
		]);
	});
});
