import { describe, expect, test } from 'bun:test';
import {
	assertDirectAiComplete,
	completeDirectAiText,
	DirectAiIncompleteError,
	type DirectAiResolution,
} from 'aidd-shared/agent/directAi';
import { disableAiCallLog } from 'aidd-shared/lib/aiCallLog';

disableAiCallLog();

function resolution(finishReason: string | undefined): DirectAiResolution {
	return {
		config: {
			baseUrl: 'https://provider.example/v1',
			fetch: async () =>
				new Response(
					JSON.stringify({
						choices: [
							{
								message: { content: ' partial answ ' },
								...(finishReason !== undefined
									? { finish_reason: finishReason }
									: {}),
							},
						],
					}),
					{ headers: { 'content-type': 'application/json' }, status: 200 },
				),
			model: 'm',
			provider: 'test',
			stream: false,
		},
		reasoningEffort: 'low',
		timeoutSeconds: 5,
	};
}

// audit-ai-1790856991: completeDirectAiText returned the fragment of a `length` turn as the run
// summary or chat reply, with nothing to say the provider had cut it off.
describe('Direct AI single-turn completion refuses an unfinished turn', () => {
	test('a length or content_filter stop throws a descriptive error; a clean stop returns the text', async () => {
		const request = { cwd: 'D:/applications/demo', prompt: 'summarize' };
		await expect(completeDirectAiText(resolution('length'), request)).rejects.toMatchObject({
			finishReason: 'length',
			message: expect.stringContaining('cut the response off at its output limit'),
			name: 'DirectAiIncompleteError',
		});
		await expect(
			completeDirectAiText(resolution('content_filter'), request),
		).rejects.toBeInstanceOf(DirectAiIncompleteError);
		expect(await completeDirectAiText(resolution('stop'), request)).toBe('partial answ');
		expect(await completeDirectAiText(resolution(undefined), request)).toBe('partial answ');
	});

	test('assertDirectAiComplete passes a clean or absent stop reason', () => {
		expect(() => assertDirectAiComplete({ finishReason: 'stop' }, 'test')).not.toThrow();
		expect(() => assertDirectAiComplete({}, 'test')).not.toThrow();
		expect(() => assertDirectAiComplete({ finishReason: 'length' }, 'test')).toThrow(
			DirectAiIncompleteError,
		);
	});
});
