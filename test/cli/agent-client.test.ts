import { describe, expect, test } from 'bun:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	createDefaultNativeClient,
	type NativeFileConfig,
	OpenAICompatibleAgentClient,
	type OpenAICompatibleClientConfig,
	providerDefaults,
	type ProviderName,
	resolveDefaultNativeClientConfig,
	SimulationAgentClient,
} from 'aidd-shared/agent/client';
import {
	type ProviderCredential,
	providerCredentials,
} from 'aidd-shared/agent/client/providerKeys';
import { readChatCompletionStream } from 'aidd-shared/agent/client/stream';
import { disableAiCallLog } from 'aidd-shared/lib/aiCallLog';

import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
disableAiCallLog();

// A response whose reader.read() never resolves, to exercise the idle-timeout path directly.
// (A real Response built from a never-closing ReadableStream is unreliable under Bun, which
// buffers the body; a minimal fake reader isolates the timeout + cancellation logic.) The
// cancel() callback records that the reader was cancelled when the idle timeout fires.
function stalledResponse(onCancel: () => void): Response {
	return {
		body: {
			getReader() {
				return {
					cancel: async () => {
						onCancel();
					},
					read: () => new Promise<{ done?: boolean; value?: Uint8Array }>(() => {}),
				};
			},
		},
	} as unknown as Response;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' },
		...init,
	});
}

// Emit the given raw strings as successive stream chunks so tests can exercise SSE frame
// buffering (a single logical frame may be split across two chunks).
function sseResponse(chunks: string[]): Response {
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
			controller.close();
		},
	});
	return new Response(stream, {
		status: 200,
		headers: { 'content-type': 'text/event-stream' },
	});
}

describe('Native provider client', () => {
	test('simulation completes selected feature metadata before emitting a feature result', async () => {
		const projectDir = await testTempDir('aidd-agent-client-');
		const featureDir = join(projectDir, '.aidd', 'features', 'feature-core');
		const featurePath = join(featureDir, 'feature.json');
		try {
			await mkdir(featureDir, { recursive: true });
			await writeFile(
				featurePath,
				`${JSON.stringify({
					id: 'feature-core',
					title: 'Core feature',
					status: 'backlog',
					passes: false,
				})}\n`,
			);
			const client = new SimulationAgentClient();

			const response = await client.complete(
				{
					prompt: 'Finish with AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}',
					cwd: projectDir,
				},
				new AbortController().signal,
			);

			expect(response.text).toContain(
				'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}',
			);
			expect(response.filesModified).toEqual([featurePath]);
			expect(JSON.parse(await readFile(featurePath, 'utf8'))).toMatchObject({
				id: 'feature-core',
				status: 'completed',
				passes: true,
			});
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('posts OpenAI-compatible chat requests and maps usage', async () => {
		const calls: { url: string; init: RequestInit }[] = [];
		const client = new OpenAICompatibleAgentClient({
			provider: 'test',
			apiKey: 'secret',
			baseUrl: 'https://provider.example/v1/',
			model: 'default-model',
			stream: false,
			fetch: async (url, init) => {
				calls.push({ url: String(url), init: init ?? {} });
				return jsonResponse({
					choices: [{ message: { content: 'done' } }],
					usage: { prompt_tokens: 11, completion_tokens: 22 },
				});
			},
		});

		const response = await client.complete(
			{
				prompt: 'hello',
				cwd: 'D:/applications/demo',
				model: 'override-model',
			},
			new AbortController().signal,
		);

		expect(response).toEqual({ text: 'done', inputTokens: 11, outputTokens: 22 });
		expect(calls[0]?.url).toBe('https://provider.example/v1/chat/completions');
		expect(calls[0]?.init.headers).toEqual({
			'content-type': 'application/json',
			authorization: 'Bearer secret',
		});
		expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
			model: 'override-model',
			messages: [{ role: 'user', content: 'hello' }],
			stream: false,
		});
	});

	test('maps cached and reasoning token usage detail', async () => {
		const client = new OpenAICompatibleAgentClient({
			provider: 'test',
			apiKey: 'secret',
			baseUrl: 'https://provider.example/v1/',
			model: 'default-model',
			stream: false,
			fetch: async () =>
				jsonResponse({
					choices: [{ message: { content: 'done' } }],
					usage: {
						prompt_tokens: 20244,
						completion_tokens: 44,
						prompt_tokens_details: { cached_tokens: 20160 },
						completion_tokens_details: { reasoning_tokens: 17 },
					},
				}),
		});

		const response = await client.complete(
			{ prompt: 'hello', cwd: 'D:/applications/demo' },
			new AbortController().signal,
		);

		// cached ⊂ input, reasoning ⊂ output — captured so the cost estimate can apply the
		// cached discount and avoid double-counting reasoning.
		expect(response).toEqual({
			text: 'done',
			inputTokens: 20244,
			outputTokens: 44,
			cachedTokens: 20160,
			reasoningTokens: 17,
		});
	});

	test('serializes tools and parses provider tool calls', async () => {
		let requestBody: unknown;
		const client = new OpenAICompatibleAgentClient({
			provider: 'test',
			baseUrl: 'https://provider.example/v1',
			model: 'model',
			stream: false,
			fetch: async (_url, init) => {
				requestBody = JSON.parse(String(init.body));
				return jsonResponse({
					choices: [
						{
							message: {
								content: null,
								tool_calls: [
									{
										id: 'call_1',
										function: {
											name: 'read_file',
											arguments: '{"path":"README.md"}',
										},
									},
								],
							},
						},
					],
				});
			},
		});

		const response = await client.complete(
			{
				prompt: 'hello',
				cwd: 'D:/applications/demo',
				messages: [
					{ role: 'user', content: 'hello' },
					{
						role: 'assistant',
						content: null,
						toolCalls: [{ id: 'old', name: 'read_file', arguments: '{}' }],
					},
					{ role: 'tool', toolCallId: 'old', content: 'result' },
				],
				tools: [
					{
						type: 'function',
						function: {
							name: 'read_file',
							description: 'read',
							parameters: { type: 'object' },
						},
					},
				],
			},
			new AbortController().signal,
		);

		expect(response).toEqual({
			text: '',
			toolCalls: [{ id: 'call_1', name: 'read_file', arguments: '{"path":"README.md"}' }],
		});
		expect(requestBody).toMatchObject({
			tool_choice: 'auto',
			tools: [{ function: { name: 'read_file' } }],
			messages: [
				{ role: 'user', content: 'hello' },
				{
					role: 'assistant',
					content: null,
					tool_calls: [{ id: 'old', function: { name: 'read_file', arguments: '{}' } }],
				},
				{ role: 'tool', tool_call_id: 'old', content: 'result' },
			],
		});
	});

	test('serializes provider reasoning and Ollama thinking controls', async () => {
		const zhipuBodies: unknown[] = [];
		const zhipu = new OpenAICompatibleAgentClient({
			provider: 'zhipu',
			baseUrl: 'https://provider.example/v1',
			model: 'glm-5.3',
			stream: false,
			fetch: async (_url, init) => {
				zhipuBodies.push(JSON.parse(String(init.body)));
				return jsonResponse({ choices: [{ message: { content: 'done' } }] });
			},
		});
		await zhipu.complete(
			{
				prompt: 'hello',
				cwd: 'D:/applications/demo',
				reasoningEffort: 'high',
			},
			new AbortController().signal,
		);
		expect(zhipuBodies[0]).toMatchObject({ reasoning_effort: 'high' });

		const ollamaBodies: unknown[] = [];
		const ollama = new OpenAICompatibleAgentClient({
			provider: 'ollama',
			baseUrl: 'http://localhost:11434/v1',
			model: 'qwen3.6:latest',
			fetch: async (_url, init) => {
				ollamaBodies.push(JSON.parse(String(init.body)));
				return jsonResponse({ choices: [{ message: { content: 'done' } }] });
			},
		});
		await ollama.complete(
			{
				prompt: 'hello',
				cwd: 'D:/applications/demo',
				thinking: false,
			},
			new AbortController().signal,
		);
		await ollama.complete(
			{
				prompt: 'hello',
				cwd: 'D:/applications/demo',
				model: 'gpt-oss:20b',
				thinkingLevel: 'low',
			},
			new AbortController().signal,
		);
		expect(ollamaBodies[0]).toMatchObject({ think: false });
		expect(ollamaBodies[1]).toMatchObject({ model: 'gpt-oss:20b', think: 'low' });
		expect(ollamaBodies[1]).not.toHaveProperty('reasoning_effort');

		// LM Studio uses neither Ollama's `think` nor the OpenAI `reasoning_effort` field;
		// requests must omit both even when a reasoning effort is supplied.
		const lmstudioBodies: unknown[] = [];
		const lmstudio = new OpenAICompatibleAgentClient({
			provider: 'lmstudio',
			baseUrl: 'http://localhost:1234/v1',
			model: 'openai/gpt-oss-20b',
			fetch: async (_url, init) => {
				lmstudioBodies.push(JSON.parse(String(init.body)));
				return jsonResponse({ choices: [{ message: { content: 'done' } }] });
			},
		});
		await lmstudio.complete(
			{ prompt: 'hello', cwd: 'D:/applications/demo', reasoningEffort: 'high' },
			new AbortController().signal,
		);
		expect(lmstudioBodies[0]).not.toHaveProperty('reasoning_effort');
		expect(lmstudioBodies[0]).not.toHaveProperty('think');
	});

	test('reports provider HTTP failures', async () => {
		const client = new OpenAICompatibleAgentClient({
			provider: 'test',
			baseUrl: 'https://provider.example/v1',
			model: 'model',
			fetch: async () => new Response('bad request', { status: 400 }),
		});

		await expect(
			client.complete(
				{ prompt: 'hello', cwd: 'D:/applications/demo' },
				new AbortController().signal,
			),
		).rejects.toThrow('test request failed: HTTP 400 bad request');
	});

	test('uses simulation only when explicitly forced', async () => {
		await expect(
			createDefaultNativeClient({ AIDD_NATIVE_SIMULATION: '1' }, {}),
		).resolves.toBeInstanceOf(SimulationAgentClient);
		await expect(createDefaultNativeClient({ NATIVE_PROVIDER: 'zhipu' }, {})).rejects.toThrow(
			/no API key configured/,
		);
	});

	test('creates a real OpenAI-compatible client from env', async () => {
		await expect(
			createDefaultNativeClient(
				{
					NATIVE_PROVIDER: 'ollama',
					NATIVE_BASE_URL: 'http://localhost:11434/v1',
					NATIVE_MODEL: 'llama3.1',
				},
				{},
			),
		).resolves.toBeInstanceOf(OpenAICompatibleAgentClient);
	});

	test('resolves Native provider precedence from env over config', async () => {
		await expect(
			resolveDefaultNativeClientConfig(
				{
					NATIVE_PROVIDER: 'ollama',
					NATIVE_BASE_URL: 'http://env.example/v1',
					NATIVE_MODEL: 'env-model',
				},
				{
					defaultProvider: 'zhipu',
					providers: {
						ollama: {
							baseUrl: 'http://config.example/v1',
							model: 'config-model',
						},
					},
				},
			),
		).resolves.toEqual({
			kind: 'openai-compatible',
			config: {
				provider: 'ollama',
				baseUrl: 'http://env.example/v1',
				model: 'env-model',
			},
		});
	});

	test('resolves provider-scoped zhipu config and rejects flat or missing-key configurations', async () => {
		await expect(
			resolveDefaultNativeClientConfig(
				{},
				{
					providers: {
						zhipu: {
							apiKey: 'provider-key',
							baseUrl: 'https://provider.example/v1',
							model: 'provider-model',
						},
					},
				},
			),
		).resolves.toEqual({
			kind: 'openai-compatible',
			config: {
				provider: 'zhipu',
				apiKey: 'provider-key',
				baseUrl: 'https://provider.example/v1',
				model: 'provider-model',
			},
		});

		await expect(
			resolveDefaultNativeClientConfig({}, {
				apiKey: 'flat-key',
				baseUrl: 'https://flat.example/v1',
				model: 'flat-model',
			} as unknown as NativeFileConfig),
		).rejects.toThrow(/no API key configured/);

		await expect(
			resolveDefaultNativeClientConfig({ NATIVE_PROVIDER: 'zhipu' }, {}),
		).rejects.toThrow(/no API key configured/);
	});

	test('resolves xai provider defaults, XAI_API_KEY, and surfaces it in the missing-key error', async () => {
		await expect(
			resolveDefaultNativeClientConfig(
				{ NATIVE_PROVIDER: 'xai', XAI_API_KEY: 'xai-key' },
				{},
			),
		).resolves.toEqual({
			kind: 'openai-compatible',
			config: {
				provider: 'xai',
				apiKey: 'xai-key',
				baseUrl: 'https://api.x.ai/v1',
				model: 'grok-4.6',
			},
		});

		await expect(
			resolveDefaultNativeClientConfig({ NATIVE_PROVIDER: 'xai' }, {}),
		).rejects.toThrow(/Set NATIVE_API_KEY \(or XAI_API_KEY\)/);
	});

	test('resolves openai provider defaults, OPENAI_API_KEY, and surfaces it in the missing-key error', async () => {
		await expect(
			resolveDefaultNativeClientConfig(
				{ NATIVE_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-key' },
				{},
			),
		).resolves.toEqual({
			kind: 'openai-compatible',
			config: {
				provider: 'openai',
				apiKey: 'sk-key',
				baseUrl: 'https://api.openai.com/v1',
				model: 'gpt-6-astra',
			},
		});

		await expect(
			resolveDefaultNativeClientConfig({ NATIVE_PROVIDER: 'openai' }, {}),
		).rejects.toThrow(/Set NATIVE_API_KEY \(or OPENAI_API_KEY\)/);
	});

	test('resolves lmstudio provider defaults with a localhost base URL and no API key', async () => {
		await expect(
			resolveDefaultNativeClientConfig({ NATIVE_PROVIDER: 'lmstudio' }, {}),
		).resolves.toEqual({
			kind: 'openai-compatible',
			config: {
				provider: 'lmstudio',
				baseUrl: 'http://localhost:1234/v1',
				model: 'openai/gpt-oss-20b',
			},
		});
	});
});

describe('Native provider client — a provider key authenticates only its own provider', () => {
	// A provider key in the shell is a credential one vendor issued. Sending it to a different
	// vendor's base URL is not a local misconfiguration, it is a disclosure, so the property under
	// test is exclusion rather than precedence: with every foreign key present and its own absent,
	// a provider must fail rather than borrow.
	const credentials = providerCredentials({});
	const keyed = (Object.keys(providerDefaults) as ProviderName[])
		.map((provider) => [provider, credentials[provider]] as const)
		.filter((entry): entry is readonly [ProviderName, ProviderCredential] => entry[1] !== null);

	test('the credential table covers every provider, and every provider that requires a key', () => {
		expect(Object.keys(credentials).sort()).toEqual(Object.keys(providerDefaults).sort());
		for (const [provider, defaults] of Object.entries(providerDefaults)) {
			expect([provider, credentials[provider as ProviderName] !== null]).toEqual([
				provider,
				defaults.apiKeyRequired,
			]);
		}
		expect(keyed.length).toBeGreaterThan(1);
	});

	test('each provider accepts the variable its own table row advertises', async () => {
		for (const [provider, credential] of keyed) {
			await expect(
				resolveDefaultNativeClientConfig(
					{ NATIVE_PROVIDER: provider, [credential.envVar]: `${provider}-key` },
					{},
				),
			).resolves.toMatchObject({ config: { apiKey: `${provider}-key`, provider } });
		}
	});

	test('every other provider key in the environment is refused, not borrowed', async () => {
		for (const [provider, credential] of keyed) {
			const foreignKeys: NodeJS.ProcessEnv = { NATIVE_PROVIDER: provider };
			for (const [other, otherCredential] of keyed) {
				if (other !== provider) foreignKeys[otherCredential.envVar] = `${other}-key`;
			}
			await expect(resolveDefaultNativeClientConfig(foreignKeys, {})).rejects.toThrow(
				new RegExp(
					`Native ${provider} provider has no API key configured\\. ` +
						`Set NATIVE_API_KEY \\(or ${credential.envVar}\\)`,
				),
			);
		}
	});

	test('precedence per provider is NATIVE_API_KEY, then its own variable, then config', async () => {
		for (const [provider, credential] of keyed) {
			const fileConfig: NativeFileConfig = { providers: { [provider]: { apiKey: 'file' } } };
			await expect(
				resolveDefaultNativeClientConfig(
					{
						NATIVE_PROVIDER: provider,
						NATIVE_API_KEY: 'native',
						[credential.envVar]: 'own',
					},
					fileConfig,
				),
			).resolves.toMatchObject({ config: { apiKey: 'native' } });
			await expect(
				resolveDefaultNativeClientConfig(
					{ NATIVE_PROVIDER: provider, [credential.envVar]: 'own' },
					fileConfig,
				),
			).resolves.toMatchObject({ config: { apiKey: 'own' } });
			await expect(
				resolveDefaultNativeClientConfig({ NATIVE_PROVIDER: provider }, fileConfig),
			).resolves.toMatchObject({ config: { apiKey: 'file' } });
		}
	});
});

describe('Native provider client — streaming', () => {
	function streamingClient(fetchImpl: NonNullable<OpenAICompatibleClientConfig['fetch']>) {
		return new OpenAICompatibleAgentClient({
			provider: 'zhipu',
			apiKey: 'secret',
			baseUrl: 'https://provider.example/v1',
			model: 'glm-5.3',
			fetch: fetchImpl,
		});
	}

	test('remote providers stream by default and reassemble content + usage', async () => {
		let body: Record<string, unknown> | undefined;
		const client = streamingClient(async (_url, init) => {
			body = JSON.parse(String(init.body));
			return sseResponse([
				'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
				'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
				'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":5,"completion_tokens":2,"completion_tokens_details":{"reasoning_tokens":1}}}\n\n',
				'data: [DONE]\n\n',
			]);
		});

		const response = await client.complete(
			{ prompt: 'hi', cwd: 'D:/applications/demo' },
			new AbortController().signal,
		);

		expect(response).toEqual({
			text: 'Hello',
			inputTokens: 5,
			outputTokens: 2,
			reasoningTokens: 1,
		});
		expect(body).toMatchObject({ stream: true, stream_options: { include_usage: true } });
	});

	test('surfaces content and reasoning fragments through request.onDelta as they stream', async () => {
		const client = streamingClient(async () =>
			sseResponse([
				'data: {"choices":[{"delta":{"reasoning_content":"weighing "}}]}\n\n',
				'data: {"choices":[{"delta":{"reasoning_content":"options"}}]}\n\n',
				'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
				'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
				'data: [DONE]\n\n',
			]),
		);

		const deltas: { kind: string; text: string }[] = [];
		const response = await client.complete(
			{ prompt: 'hi', cwd: 'D:/applications/demo' },
			new AbortController().signal,
			(delta) => deltas.push(delta),
		);

		// Reasoning fragments surface for live progress but stay out of the final message.
		expect(response.text).toBe('Hello');
		expect(deltas).toEqual([
			{ kind: 'reasoning', text: 'weighing ' },
			{ kind: 'reasoning', text: 'options' },
			{ kind: 'text', text: 'Hel' },
			{ kind: 'text', text: 'lo' },
		]);
	});

	test('reassembles tool-call fragments streamed across chunks', async () => {
		const client = streamingClient(async () =>
			sseResponse([
				'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_file","arguments":"{\\"pa"}}]}}]}\n\n',
				'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"th\\":\\"README.md\\"}"}}]}}]}\n\n',
				'data: [DONE]\n\n',
			]),
		);

		const response = await client.complete(
			{ prompt: 'hi', cwd: 'D:/applications/demo' },
			new AbortController().signal,
		);

		expect(response.toolCalls).toEqual([
			{ id: 'call_1', name: 'read_file', arguments: '{"path":"README.md"}' },
		]);
	});

	test('buffers an SSE frame split across a chunk boundary', async () => {
		const client = streamingClient(async () =>
			sseResponse([
				'data: {"choices":[{"delta":{"con',
				'tent":"split"}}]}\n\ndata: [DONE]\n\n',
			]),
		);

		const response = await client.complete(
			{ prompt: 'hi', cwd: 'D:/applications/demo' },
			new AbortController().signal,
		);

		expect(response.text).toBe('split');
	});

	test('surfaces a mid-stream error event as a thrown error', async () => {
		const client = streamingClient(async () =>
			sseResponse(['data: {"error":{"message":"upstream exploded"}}\n\n']),
		);

		await expect(
			client.complete(
				{ prompt: 'hi', cwd: 'D:/applications/demo' },
				new AbortController().signal,
			),
		).rejects.toThrow(/upstream exploded/);
	});
});

describe('readChatCompletionStream — lifecycle and integrity', () => {
	test('rejects a stalled stream after the idle timeout and cancels the reader', async () => {
		let cancelled = false;
		const response = stalledResponse(() => {
			cancelled = true;
		});

		await expect(
			readChatCompletionStream(response, 'zhipu', { idleTimeoutMs: 30 }),
		).rejects.toThrow(/timed out/);
		expect(cancelled).toBe(true);
	});

	test('rejects a stream that ends without a terminal marker (truncation)', async () => {
		// No `[DONE]` and no finish_reason — an abrupt EOF that must not read as a short success.
		const response = sseResponse(['data: {"choices":[{"delta":{"content":"partial"}}]}\n\n']);

		await expect(readChatCompletionStream(response, 'zhipu')).rejects.toThrow(
			/ended before completion|network error/,
		);
	});

	test('accepts a stream terminated by finish_reason without an explicit [DONE]', async () => {
		const response = sseResponse([
			'data: {"choices":[{"delta":{"content":"hi"},"finish_reason":"stop"}]}\n\n',
		]);

		const result = await readChatCompletionStream(response, 'zhipu');
		expect(result.choices?.[0]?.message?.content).toBe('hi');
	});

	test('rejects a malformed data frame instead of silently dropping it', async () => {
		const response = sseResponse(['data: {not valid json}\n\n', 'data: [DONE]\n\n']);

		await expect(readChatCompletionStream(response, 'zhipu')).rejects.toThrow(/malformed/);
	});

	test('aborts a runaway stream that exceeds the max accumulated size', async () => {
		const response = sseResponse([
			`data: {"choices":[{"delta":{"content":"${'x'.repeat(50)}"}}]}\n\n`,
			'data: [DONE]\n\n',
		]);

		await expect(readChatCompletionStream(response, 'zhipu', { maxChars: 10 })).rejects.toThrow(
			/exceeded the maximum/,
		);
	});
});
