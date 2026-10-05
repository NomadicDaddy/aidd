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
