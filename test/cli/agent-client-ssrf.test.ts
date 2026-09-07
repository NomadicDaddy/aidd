import { describe, expect, test } from 'bun:test';
import { OpenAICompatibleAgentClient } from 'aidd-shared/agent/client';
import { resolveDirectAiCall } from 'aidd-shared/agent/directAi';
import { resolveMergedConfig } from 'aidd-shared/config';
import { disableAiCallLog } from 'aidd-shared/lib/aiCallLog';
import { agentBaseUrlValidationError } from 'aidd-shared/security/ssrfGuard';

disableAiCallLog();

describe('provider egress guard', () => {
	test.each([
		'http://metadata.google.internal./v1',
		'http://metadata/v1',
		'http://METADATA./v1',
		'http://metadata.goog./v1',
		'http://instance.metadata.google.internal./v1',
		'http://METADATA.GOOGLE.INTERNAL/v1',
		'http://169.254.169.254./latest',
		'http://169.254.170.2/v2/credentials',
		'http://169.254.170.23/v1/credentials',
		'http://[fd00:ec2::23]/v1/credentials',
		'http://[::ffff:169.254.170.2]/v1',
		'http://100.100.100.200./v1',
		'http://[::ffff:169.254.169.254]/v1',
		'http://2852039166/v1',
		'http://0xA9FEA9FE/v1',
	])('rejects %s before invoking fetch', async (baseUrl) => {
		let calls = 0;
		const client = new OpenAICompatibleAgentClient({
			baseUrl,
			fetch: async () => {
				calls++;
				return new Response('{}');
			},
			model: 'test',
			provider: 'test',
		});
		expect(agentBaseUrlValidationError(baseUrl, 'test')).toContain('cloud metadata endpoint');
		await expect(
			client.complete({ cwd: '.', prompt: 'test' }, new AbortController().signal),
		).rejects.toThrow('cloud metadata endpoint');
		expect(calls).toBe(0);
	});

	test('local provider requests preserve the abort signal and prohibit redirects', async () => {
		const signal = new AbortController().signal;
		let calls = 0;
		const client = new OpenAICompatibleAgentClient({
			baseUrl: 'http://127.0.0.1:11434/v1',
			fetch: async (_url, init) => {
				calls++;
				expect(init.signal).toBe(signal);
				expect(init.redirect).toBe('error');
				return Response.json({ choices: [{ message: { content: 'ok' } }] });
			},
			model: 'test',
			provider: 'test',
			stream: false,
		});
		expect((await client.complete({ cwd: '.', prompt: 'test' }, signal)).text).toBe('ok');
		expect(calls).toBe(1);
	});

	test.each(['direct', 'provider'])('Direct AI rejects metadata from its %s config', (source) => {
		const baseUrl = 'http://metadata.google.internal./v1';
		const config = resolveMergedConfig({
			directAi: {
				...(source === 'direct' ? { baseUrl } : {}),
				enabled: true,
				provider: 'ollama',
			},
			providers: { ollama: source === 'provider' ? { baseUrl } : {} },
		});
		expect(() => resolveDirectAiCall(config, { surface: 'directorChat' })).toThrow(
			'cloud metadata endpoint',
		);
	});
});
