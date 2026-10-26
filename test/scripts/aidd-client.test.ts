import { describe, expect, spyOn, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseClientRequest, requestApi } from '../../scripts/aidd-client.ts';
import { testTempDir } from '../_helpers/temp.ts';

describe('aidd API client', () => {
	test('keeps the existing GET default and rejects unsupported writes', async () => {
		expect(await parseClientRequest([])).toEqual({ method: 'GET', path: '/api/v1/projects' });
		await expect(parseClientRequest(['--method', 'DELETE'])).rejects.toThrow('GET or POST');
		await expect(parseClientRequest(['--body-file', 'absent.json'])).rejects.toThrow(
			'requires POST',
		);
	});

	test('sends the UTF-8 body file as JSON without shell interpretation or logging credentials', async () => {
		const dir = await testTempDir('aidd-client-');
		const path = join(dir, 'request.json');
		const body = JSON.stringify({ projectDir: 'C:\\fixture project', args: 'café $(literal)' });
		await writeFile(path, body);
		const request = await parseClientRequest([
			'--method',
			'POST',
			'--path',
			'/api/v1/skills/example/run',
			'--body-file',
			path,
		]);
		const received: {
			auth: null | string;
			body: string;
			method: string;
			type: null | string;
		}[] = [];
		const server = Bun.serve({
			hostname: '127.0.0.1',
			port: 0,
			fetch: async (incoming) => {
				received.push({
					auth: incoming.headers.get('authorization'),
					body: await incoming.text(),
					method: incoming.method,
					type: incoming.headers.get('content-type'),
				});
				return Response.json({ session: { id: 'fixture-session' } });
			},
		});
		const messages: string[] = [];
		const log = spyOn(console, 'log').mockImplementation((value: unknown) =>
			messages.push(String(value)),
		);
		try {
			if (server.port === undefined) throw new Error('Fixture has no TCP port');
			expect(
				await requestApi(
					{ authToken: 'fixture-only-token', hostname: '127.0.0.1', port: server.port },
					request,
				),
			).toBe(0);
			expect(received).toEqual([
				{
					auth: 'Bearer fixture-only-token',
					body,
					method: 'POST',
					type: 'application/json',
				},
			]);
			expect(messages.join('\n')).toContain('fixture-session');
			expect(messages.join('\n')).not.toContain('fixture-only-token');
			expect(messages.join('\n')).not.toContain('$(literal)');
		} finally {
			log.mockRestore();
			await server.stop(true);
		}
	});

	test('rejects invalid JSON before sending and preserves HTTP failure status', async () => {
		const dir = await testTempDir('aidd-client-invalid-');
		const path = join(dir, 'invalid.json');
		await writeFile(path, '{');
		await expect(
			parseClientRequest(['--method', 'POST', '--body-file', path]),
		).rejects.toThrow();
		const server = Bun.serve({
			hostname: '127.0.0.1',
			port: 0,
			fetch: () => new Response('fixture refusal', { status: 409 }),
		});
		const log = spyOn(console, 'log').mockImplementation(() => undefined);
		try {
			if (server.port === undefined) throw new Error('Fixture has no TCP port');
			expect(
				await requestApi(
					{ hostname: '127.0.0.1', port: server.port },
					{ method: 'GET', path: '/' },
				),
			).toBe(1);
		} finally {
			log.mockRestore();
			await server.stop(true);
		}
	});
});
