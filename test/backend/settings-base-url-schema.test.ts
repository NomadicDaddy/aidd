import { Elysia } from 'elysia';
import { describe, expect, test } from 'bun:test';

import { settingsConfigBody } from '../../backend/src/routes/settings.ts';

const requiredBody = {
	applicationRoots: ['D:\\applications'],
	cli: 'native',
	ignoredFolders: ['node_modules'],
	reasoningEffort: 'low',
};

async function validate(body: object): Promise<Response> {
	const app = new Elysia().put('/config', ({ body: validBody }) => validBody, {
		body: settingsConfigBody,
	});
	return app.handle(
		new Request('http://localhost/config', {
			body: JSON.stringify(body),
			headers: { 'content-type': 'application/json' },
			method: 'PUT',
		}),
	);
}

describe('Settings base URL request schema', () => {
	test('accepts absolute HTTPS and loopback HTTP URLs', async () => {
		expect(
			(
				await validate({
					...requiredBody,
					directAi: { baseUrl: 'https://api.example.com/v1' },
					providers: { ollama: { baseUrl: 'http://127.0.0.1:11434/v1' } },
				})
			).status,
		).toBe(200);
	});

	test('rejects malformed and non-HTTP provider destinations at the route boundary', async () => {
		for (const [path, body] of [
			['/directAi', { directAi: { baseUrl: 'not a url' } }],
			[
				'/providers/zhipu/baseUrl',
				{ providers: { zhipu: { baseUrl: 'file:///etc/passwd' } } },
			],
		] as const) {
			const response = await validate({ ...requiredBody, ...body });
			expect(response.status).toBe(422);
			const message = await response.text();
			expect(message).toContain(path);
			expect(message).toContain('baseUrl');
		}
	});
});
