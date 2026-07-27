import { describe, expect, test } from 'bun:test';

import { probeAppUrl } from '../../cli/src/orchestrator/run/app-url-probe.ts';

describe('probeAppUrl', () => {
	test('asserts nothing when there is no address to probe', async () => {
		expect(await probeAppUrl(undefined)).toBe('unknown');
		expect(await probeAppUrl('')).toBe('unknown');
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
