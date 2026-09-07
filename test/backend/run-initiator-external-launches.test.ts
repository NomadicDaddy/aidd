import { describe, expect, test } from 'bun:test';

import type { AiddApiClient } from '../../backend/src/channels/apiClient.ts';

import { createToolDispatcher } from '../../backend/src/mcp/server.ts';
import { resolveExternalRunContext } from '../../cli/src/orchestrator/active-run-heartbeat-support.ts';
import {
	createCliActiveRunRecord,
	EXT_RUN_INITIATOR_ENV,
	EXT_RUN_SOURCE_ENV,
} from '../../shared/src/metadata/active-runs.ts';

/**
 * The two launch surfaces that reach aidd from outside the backend's own call graph.
 *
 * `run-initiator-launch-sites.test.ts` fences the backend source; neither of these is in it. MCP has
 * no launch path of its own — it posts to the operator route — and the CLI is a separate process
 * that has to be told, because nothing on its side can work the answer out.
 */

function fakeClient(): { calls: { body?: unknown; path: string }[]; client: AiddApiClient } {
	const calls: { body?: unknown; path: string }[] = [];
	const client: AiddApiClient = {
		baseUrl: 'http://127.0.0.1:3210',
		get<T = unknown>(path: string): Promise<T> {
			calls.push({ path });
			return Promise.resolve({} as T);
		},
		post<T = unknown>(path: string, body?: unknown): Promise<T> {
			calls.push({ body, path });
			return Promise.resolve({ id: 'run_1' } as T);
		},
	};
	return { calls, client };
}

describe('MCP launches', () => {
	test('launch_run has no launch path of its own — it posts to the operator route', async () => {
		// This is what makes the agent-as-proxy rule hold for MCP without a second literal to keep
		// in step: an agent launching on a request made a moment ago goes through the same route
		// the Launch button does, so it cannot name a different initiator even by accident.
		const { calls, client } = fakeClient();
		await createToolDispatcher(client).call('launch_run', {
			projectDir: 'D:/applications/demo',
		});

		expect(calls).toHaveLength(1);
		expect(calls[0]?.path).toBe('/api/v1/runs');
		expect(JSON.stringify(calls[0]?.body)).not.toContain('initiator');
	});
});

describe('CLI runs', () => {
	test('a bare CLI invocation is a person at a terminal', () => {
		const record = createCliActiveRunRecord({
			backend: 'native',
			mode: 'coding',
			model: undefined,
			projectDir: 'D:/applications/demo',
			provider: undefined,
			reasoningEffort: 'medium',
		});

		expect(record.initiator).toBe('operator');
		expect(record.source).toBe('cli');
	});

	test('a launcher hands its own answer across the env boundary, and is believed', () => {
		// The case the field exists for: a 'web' CLI child is either a Launch click or an
		// auto-chained follow-up, and only the launcher knows which — so the initiator travels
		// separately rather than being derived from the source on this side.
		const adopted = resolveExternalRunContext({
			[EXT_RUN_INITIATOR_ENV]: 'automatic',
			[EXT_RUN_SOURCE_ENV]: 'web',
		});
		expect(adopted).toMatchObject({ initiator: 'automatic', source: 'web' });

		const record = createCliActiveRunRecord({
			backend: 'native',
			initiator: 'automatic',
			mode: 'coding',
			model: undefined,
			projectDir: 'D:/applications/demo',
			provider: undefined,
			reasoningEffort: 'medium',
			source: 'web',
		});
		expect(record.initiator).toBe('automatic');
	});

	test('a junk value in the environment is not recorded as an answer', () => {
		expect(resolveExternalRunContext({ [EXT_RUN_INITIATOR_ENV]: 'user' })).not.toHaveProperty(
			'initiator',
		);
	});
});
