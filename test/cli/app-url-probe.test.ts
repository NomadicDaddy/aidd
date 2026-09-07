import { describe, expect, test } from 'bun:test';

import { probeAppUrl } from '../../cli/src/orchestrator/run/app-url-probe.ts';

describe('probeAppUrl', () => {
	test('asserts nothing when there is no address to probe', async () => {
		expect(await probeAppUrl(undefined)).toBe('unknown');
		expect(await probeAppUrl('')).toBe('unknown');
	});

	test('rejects unsafe addresses before calling fetch', async () => {
		let fetchCalls = 0;
		const fetchImpl = async (): Promise<Response> => {
			fetchCalls += 1;
			return new Response('unexpected');
		};
		const unsafeUrls = [
			'file:///etc/passwd',
			'http://169.254.169.254/latest/meta-data/',
			'http://100.100.100.200/latest/meta-data/',
			'http://metadata.goog/computeMetadata/v1/',
			'http://metadata.google.internal/computeMetadata/v1/',
			'http://instance.metadata.google.internal/computeMetadata/v1/',
			'http://[fd00:ec2::254]/latest/meta-data/',
			'http://[::ffff:169.254.169.254]/latest/meta-data/',
			'http://2852039166/latest/meta-data/',
			'http://0xa9fea9fe/latest/meta-data/',
		];

		for (const unsafeUrl of unsafeUrls) {
			expect(await probeAppUrl(unsafeUrl, fetchImpl)).toBe('unreachable');
		}
		expect(fetchCalls).toBe(0);
	});

	test('keeps loopback probes bounded, redirect-safe, and response-body-free', async () => {
		const appUrl = 'http://127.0.0.1:3210/health?source=launch-context';
		let bodyCancelled = false;
		let receivedInit: RequestInit | undefined;
		let receivedUrl: string | undefined;
		const body = new ReadableStream({
			cancel: () => {
				bodyCancelled = true;
			},
		});
		const fetchImpl = async (input: string, init: RequestInit): Promise<Response> => {
			receivedUrl = input;
			receivedInit = init;
			return new Response(body, { status: 500 });
		};

		expect(await probeAppUrl(appUrl, fetchImpl)).toBe('live');
		expect(receivedUrl).toBe(appUrl);
		expect(receivedInit?.redirect).toBe('manual');
		expect(receivedInit?.signal).toBeInstanceOf(AbortSignal);
		expect(bodyCancelled).toBe(true);
	});

	// Reachability, not health: a server answering 500 is still a server the agent can verify
	// against, and calling it dead would send the run off restarting an app that is already up.
	test('counts any HTTP response as live, including an error status', async () => {
		const server = Bun.serve({ fetch: () => new Response('boom', { status: 500 }), port: 0 });
		try {
			expect(await probeAppUrl(`http://127.0.0.1:${server.port}`)).toBe('live');
		} finally {
			await server.stop(true);
		}
	});

	test('reports unreachable when nothing is listening', async () => {
		const server = Bun.serve({ fetch: () => new Response('ok'), port: 0 });
		const port = server.port;
		await server.stop(true);
		expect(await probeAppUrl(`http://127.0.0.1:${port}`)).toBe('unreachable');
	});
});
