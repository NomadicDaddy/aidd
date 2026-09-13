import { describe, expect, test } from 'bun:test';
import {
	type AiddApiClient,
	DIRECTOR_CHAT_TIMEOUT_MS,
} from '../../backend/src/channels/apiClient.ts';
import { createToolDispatcher } from '../../backend/src/mcp/server.ts';

interface RecordedCall {
	body?: unknown;
	method: 'GET' | 'POST';
	path: string;
	timeoutMs?: number;
}

function fakeClient(responder: (method: 'GET' | 'POST', path: string, body?: unknown) => unknown): {
	client: AiddApiClient;
	calls: RecordedCall[];
} {
	const calls: RecordedCall[] = [];
	const client: AiddApiClient = {
		baseUrl: 'http://127.0.0.1:3210',
		get<T = unknown>(path: string): Promise<T> {
			calls.push({ method: 'GET', path });
			return Promise.resolve(responder('GET', path) as T);
		},
		post<T = unknown>(
			path: string,
			body?: unknown,
			options?: { timeoutMs?: number },
		): Promise<T> {
			calls.push({
				method: 'POST',
				path,
				body,
				...(options?.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
			});
			return Promise.resolve(responder('POST', path, body) as T);
		},
	};
	return { client, calls };
}

describe('MCP tool dispatcher', () => {
	test('exposes the expected tool catalog', () => {
		const { client } = fakeClient(() => ({}));
		const names = createToolDispatcher(client).listings.map((tool) => tool.name);
		expect(names).toEqual([
			'list_projects',
			'get_project',
			'launch_run',
			'get_run',
			'run_output',
			'stop_run',
			'kill_run',
			'list_suggestions',
			'launch_suggestion',
			'run_cycle',
			'director_chat',
		]);
		// Every tool advertises an object input schema.
		for (const tool of createToolDispatcher(client).listings) {
			expect(tool.inputSchema.type).toBe('object');
		}
		const launchRun = createToolDispatcher(client).listings.find(
			(tool) => tool.name === 'launch_run',
		);
		const prompt = (
			launchRun?.inputSchema as {
				properties?: { prompt?: { description?: string } };
			}
		).properties?.prompt?.description;
		expect(prompt).toContain('Do not use this to simulate an existing recipe');
	});

	test('list_projects proxies GET /api/v1/projects', async () => {
		const { client, calls } = fakeClient(() => ({ projects: [{ id: 'a' }], skippedRoots: [] }));
		const result = await createToolDispatcher(client).call('list_projects', {});
		expect(result.isError).toBe(false);
		expect(calls).toEqual([{ method: 'GET', path: '/api/v1/projects' }]);
		expect(JSON.parse(result.text)).toEqual({ projects: [{ id: 'a' }], skippedRoots: [] });
	});

	test('launch_run forwards only provided fields and encodes nothing it should not', async () => {
		const { client, calls } = fakeClient(() => ({ run: { id: 'r1' } }));
		const result = await createToolDispatcher(client).call('launch_run', {
			projectDir: 'D:/app',
			mode: 'coding',
			simulation: true,
			ignored: 'nope',
		});
		expect(result.isError).toBe(false);
		expect(calls[0]).toEqual({
			method: 'POST',
			path: '/api/v1/runs',
			body: { projectDir: 'D:/app', mode: 'coding', simulation: true },
		});
	});

	test('get_run percent-encodes the run id in the path', async () => {
		const { client, calls } = fakeClient(() => ({ run: null }));
		await createToolDispatcher(client).call('get_run', { runId: 'a/b c' });
		expect(calls[0]?.path).toBe('/api/v1/runs/a%2Fb%20c');
	});

	test('a missing required argument returns isError without calling the API', async () => {
		const { client, calls } = fakeClient(() => ({}));
		const result = await createToolDispatcher(client).call('get_project', {});
		expect(result.isError).toBe(true);
		expect(result.text).toContain('projectId');
		expect(calls).toHaveLength(0);
	});

	test('an unknown tool returns isError', async () => {
		const { client } = fakeClient(() => ({}));
		const result = await createToolDispatcher(client).call('does_not_exist', {});
		expect(result.isError).toBe(true);
		expect(result.text).toContain('Unknown tool');
	});

	test('director_chat creates one session and reuses it across calls', async () => {
		const { client, calls } = fakeClient((method, path) => {
			if (path === '/api/v1/director/chat/sessions') return { session: { id: 'sess-1' } };
			return { messages: { assistant: { content: 'pong' } } };
		});
		const dispatcher = createToolDispatcher(client);

		const first = await dispatcher.call('director_chat', { message: 'ping' });
		expect(first.isError).toBe(false);
		expect(JSON.parse(first.text)).toEqual({ reply: 'pong', sessionId: 'sess-1' });

		await dispatcher.call('director_chat', { message: 'again' });

		const createCalls = calls.filter((call) => call.path === '/api/v1/director/chat/sessions');
		const messageCalls = calls.filter((call) => call.path.endsWith('/messages'));
		expect(createCalls).toHaveLength(1);
		expect(messageCalls).toHaveLength(2);
		expect(messageCalls[0]?.path).toBe('/api/v1/director/chat/sessions/sess-1/messages');
		expect(createCalls[0]?.timeoutMs).toBeUndefined();
		expect(messageCalls.every((call) => call.timeoutMs === DIRECTOR_CHAT_TIMEOUT_MS)).toBe(
			true,
		);
	});

	test('propagates API errors as isError results', async () => {
		const { client } = fakeClient(() => {
			throw new Error('boom');
		});
		const result = await createToolDispatcher(client).call('list_suggestions', {});
		expect(result.isError).toBe(true);
		expect(result.text).toBe('boom');
	});
});
