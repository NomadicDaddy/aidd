import { expect, test } from 'bun:test';
import { OpenAICompatibleAgentClient } from 'aidd-shared/agent/client';
import { disableAiCallLog } from 'aidd-shared/lib/aiCallLog';

disableAiCallLog();

test.each([200, 500])(
	'HTTP %s body is cancelled before an unbounded response is read',
	async (status) => {
		let cancelled = false;
		let pulls = 0;
		const client = new OpenAICompatibleAgentClient({
			baseUrl: 'http://127.0.0.1:11434/v1',
			fetch: async () =>
				new Response(
					new ReadableStream<Uint8Array>({
						cancel() {
							cancelled = true;
						},
						pull(controller) {
							pulls++;
							controller.enqueue(new Uint8Array(1_000_000));
						},
					}),
					{ status },
				),
			model: 'test',
			provider: 'test',
			stream: false,
		});
		await expect(
			client.complete({ cwd: '.', prompt: 'test' }, new AbortController().signal),
		).rejects.toThrow('response exceeds');
		expect(cancelled).toBe(true);
		expect(pulls).toBeLessThanOrEqual(26);
	},
);

test.each([400, 500])('HTTP %s error details are scrubbed and bounded', async (status) => {
	const client = new OpenAICompatibleAgentClient({
		baseUrl: 'http://127.0.0.1:11434/v1',
		fetch: async () =>
			new Response(
				`context length exceeded; apiKey=FAKE_CREDENTIAL_VALUE_123456 ${'x'.repeat(64_000)}`,
				{ status },
			),
		model: 'test',
		provider: 'test',
	});
	let message: string;
	try {
		await client.complete({ cwd: '.', prompt: 'test' }, new AbortController().signal);
		throw new Error('Expected provider rejection');
	} catch (error) {
		message = error instanceof Error ? error.message : String(error);
	}
	// Both the ordinary failure and the context-window explanation preserve bounded diagnostics.
	if (status === 400) expect(message).toContain('Raise the model');
	expect(message).toContain(`HTTP ${status}`);
	expect(message).toEndWith('…[truncated]');
	expect(message).not.toContain('FAKE_CREDENTIAL_VALUE_123456');
	expect(message.length).toBeLessThan(1400);
});
