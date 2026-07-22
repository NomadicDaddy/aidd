import { describe, expect, test } from 'bun:test';
import { parseCodexBackendLine, parseCodexBackendOutput } from 'aidd-shared/backends/parsers/codex';
import { parseOpencodeFamilyOutput } from 'aidd-shared/backends/parsers/opencode-family';
import { parsePlainBackendOutput } from 'aidd-shared/backends/parsers/plain';
import { exitCodeFromEvents, orchestratorExitCodes } from 'aidd-shared/orchestrator/result';

describe('backend parser', () => {
	test('classifies rate limits', () => {
		const events = parsePlainBackendOutput('', 'hit your rate limit', 1);
		expect(events.some((event) => event.type === 'rate_limit')).toBe(true);
		expect(
			events.some((event) => event.type === 'error' && event.reason === 'rate_limit')
		).toBe(true);
	});

	test('normalizes assistant, tool, usage, and result lines', () => {
		const stdout = [
			JSON.stringify({
				type: 'assistant',
				message: {
					content: [{ type: 'text', text: 'hello' }],
					usage: { input_tokens: 5, output_tokens: 7 },
				},
			}),
			'[TOOL USE] Bash',
			'[TOOL RESULT] done',
		].join('\n');
		const events = parsePlainBackendOutput(stdout, '', 0);
		expect(events.some((event) => event.type === 'assistant_text')).toBe(true);
		expect(events.some((event) => event.type === 'tool_call')).toBe(true);
		expect(events.some((event) => event.type === 'tool_result')).toBe(true);
		expect(events.some((event) => event.type === 'usage')).toBe(true);
	});

	test('normalizes Codex JSONL error rate limits', () => {
		const events = parsePlainBackendOutput(
			JSON.stringify({ type: 'error', message: 'you hit your rate limit' }),
			'',
			1
		);
		expect(events.some((event) => event.type === 'rate_limit')).toBe(true);
	});

	test('provider-owned metadata cannot downgrade plain-backend errors to nonfatal', () => {
		const events = parsePlainBackendOutput(
			JSON.stringify({
				type: 'error',
				fatal: false,
				message: 'HTTP 401 invalid API key',
			}),
			'',
			0
		);

		expect(exitCodeFromEvents(events)).toBe(orchestratorExitCodes.providerError);
	});

	test('normalizes Codex command execution records', () => {
		const events = parsePlainBackendOutput(
			[
				JSON.stringify({
					type: 'command_execution',
					command: 'bun run smoke:dev',
				}),
				JSON.stringify({
					type: 'command_execution_result',
					command: 'bun run smoke:dev',
					output: 'timed out after 120000ms',
				}),
			].join('\n'),
			'',
			0
		);

		expect(events).toContainEqual({
			type: 'tool_call',
			tool: 'bash',
			args: { command: 'bun run smoke:dev' },
		});
		expect(events).toContainEqual({
			type: 'tool_result',
			tool: 'bash',
			result: 'timed out after 120000ms',
		});
		expect(events.filter((event) => event.type === 'tool_call')).toHaveLength(1);
	});

	test('captures Codex cached_input_tokens and reasoning_output_tokens detail', () => {
		// Real captured gpt-5.6 turn.completed envelope (high-effort reasoning prompt).
		const events = parseCodexBackendOutput(
			JSON.stringify({
				type: 'turn.completed',
				usage: {
					input_tokens: 19865,
					cached_input_tokens: 2432,
					output_tokens: 78,
					reasoning_output_tokens: 27,
				},
			}),
			'',
			0
		);
		const usage = events.find((event) => event.type === 'usage');
		expect(usage).toBeDefined();
		if (usage?.type !== 'usage') throw new Error('expected usage event');
		// cached is a subset of input; reasoning is a subset of output (OpenAI Responses).
		expect(usage.inputTokens).toBe(19865);
		expect(usage.outputTokens).toBe(78);
		expect(usage.cachedTokens).toBe(2432);
		expect(usage.reasoningTokens).toBe(27);
	});

	test('preserves Codex command exit codes for gate classification', () => {
		const events = parseCodexBackendLine(
			JSON.stringify({
				type: 'item.completed',
				item: {
					type: 'command_execution',
					command: 'bun run smoke:qc',
					aggregated_output: '[OK] lint and typecheck',
					exit_code: 0,
				},
			})
		);

		expect(events).toEqual([
			{
				type: 'tool_result',
				tool: 'bash',
				result: '[OK] lint and typecheck',
				exitCode: 0,
			},
		]);
	});

	test('normalizes kilo/opencode disjoint token buckets into the subset convention', () => {
		// Real captured kilo step_finish envelopes. kilo reports DISJOINT buckets:
		// total = input + output + reasoning + cache.read + cache.write. We renormalize so
		// cachedTokens ⊂ inputTokens and reasoningTokens ⊂ outputTokens (matching codex).
		const events = parseOpencodeFamilyOutput(
			[
				JSON.stringify({
					type: 'text',
					part: { type: 'text', text: 'Don’t Panic.' },
				}),
				JSON.stringify({
					type: 'tool_use',
					part: {
						type: 'tool',
						tool: 'bash',
						state: {
							status: 'completed',
							input: { command: 'echo 42' },
							output: '42\n',
						},
					},
				}),
				JSON.stringify({
					type: 'step_finish',
					part: {
						type: 'step-finish',
						reason: 'tool-calls',
						tokens: {
							total: 20238,
							input: 20194,
							output: 27,
							reasoning: 17,
							cache: { write: 0, read: 0 },
						},
						cost: 0,
					},
				}),
				JSON.stringify({
					type: 'step_finish',
					part: {
						type: 'step-finish',
						reason: 'stop',
						tokens: {
							total: 20254,
							input: 84,
							output: 10,
							reasoning: 0,
							cache: { write: 0, read: 20160 },
						},
						cost: 0,
					},
				}),
			].join('\n'),
			'',
			0
		);
		expect(events.some((event) => event.type === 'assistant_text')).toBe(true);
		expect(events).toContainEqual({
			type: 'tool_call',
			tool: 'bash',
			args: { command: 'echo 42' },
		});
		expect(events).toContainEqual({ type: 'tool_result', tool: 'bash', result: '42\n' });
		const usages = events.filter((event) => event.type === 'usage');
		expect(usages).toHaveLength(2);
		const [first, second] = usages;
		if (first?.type !== 'usage' || second?.type !== 'usage')
			throw new Error('expected usage events');
		// Step 1: no cache. reasoning (17) folds into output and is also kept for visibility.
		expect(first.inputTokens).toBe(20194);
		expect(first.outputTokens).toBe(44); // 27 output + 17 reasoning
		expect(first.cachedTokens).toBe(0);
		expect(first.reasoningTokens).toBe(17);
		expect(first.costUsd).toBe(0);
		// Step 2: 20160 cache.read becomes a subset of inputTokens (84 fresh + 20160 cached).
		expect(second.inputTokens).toBe(20244);
		expect(second.cachedTokens).toBe(20160);
		expect(second.outputTokens).toBe(10);
	});

	test('captures opencode step_finish token usage', () => {
		// Real captured opencode envelope (shared CLI lineage with kilo).
		const events = parseOpencodeFamilyOutput(
			JSON.stringify({
				type: 'step_finish',
				part: {
					type: 'step-finish',
					reason: 'stop',
					tokens: {
						total: 15332,
						input: 15265,
						output: 3,
						reasoning: 0,
						cache: { write: 0, read: 64 },
					},
					cost: 0,
				},
			}),
			'',
			0
		);
		const usage = events.find((event) => event.type === 'usage');
		expect(usage).toBeDefined();
		if (usage?.type !== 'usage') throw new Error('expected usage event');
		expect(usage.inputTokens).toBe(15329); // 15265 fresh + 64 cache.read
		expect(usage.cachedTokens).toBe(64);
		expect(usage.outputTokens).toBe(3);
	});
});

describe('claude-code structured rate limits', () => {
	test('rejected rate_limit_event yields a rate_limit event with ISO resetAt', () => {
		const line = JSON.stringify({
			type: 'rate_limit_event',
			rate_limit_info: {
				status: 'rejected',
				resetsAt: 1783550400,
				rateLimitType: 'five_hour',
			},
		});
		const events = parsePlainBackendOutput(line, '', 1);
		const rateLimit = events.find((event) => event.type === 'rate_limit');
		expect(rateLimit).toBeDefined();
		if (rateLimit?.type !== 'rate_limit') throw new Error('expected rate_limit event');
		expect(rateLimit.resetAt).toBe(new Date(1783550400 * 1000).toISOString());
		// The trailing exit-fallback error must honor the structured event, not downgrade to provider.
		expect(
			events.some((event) => event.type === 'error' && event.reason === 'rate_limit')
		).toBe(true);
		expect(events.some((event) => event.type === 'error' && event.reason === 'provider')).toBe(
			false
		);
	});

	test('non-rejected rate_limit_event statuses emit nothing', () => {
		const line = JSON.stringify({
			type: 'rate_limit_event',
			rate_limit_info: { status: 'allowed_warning', resetsAt: 1783550400 },
		});
		const events = parsePlainBackendOutput(line, '', 0);
		expect(events.some((event) => event.type === 'rate_limit')).toBe(false);
	});

	test('session-limit 429 result classifies as rate limit', () => {
		const line = JSON.stringify({
			type: 'result',
			subtype: 'success',
			is_error: true,
			api_error_status: 429,
			result: "You've hit your session limit · resets 5:40pm (America/Chicago)",
		});
		const events = parsePlainBackendOutput(line, '', 1);
		expect(events.some((event) => event.type === 'rate_limit')).toBe(true);
		expect(
			events.some((event) => event.type === 'error' && event.reason === 'rate_limit')
		).toBe(true);
	});
});

describe('codex real error surfacing', () => {
	test('item.completed error items emit a provider error with the message', () => {
		const line = JSON.stringify({
			type: 'item.completed',
			item: {
				id: 'item_0',
				type: 'error',
				message:
					'Model metadata for `gpt-5.6-sol` not found. Defaulting to fallback metadata.',
			},
		});
		const events = parseCodexBackendOutput(line, 'Reading prompt from stdin...\n', 1);
		const error = events.find((event) => event.type === 'error' && event.reason === 'provider');
		expect(error).toBeDefined();
		if (error?.type !== 'error') throw new Error('expected error event');
		expect(error.fatal).toBe(false);
		expect(JSON.stringify(error.meta)).toContain('gpt-5.6-sol');
	});

	test('nonfatal skill-description diagnostics do not override a successful Codex turn', () => {
		const stdout = [
			JSON.stringify({
				type: 'item.completed',
				item: {
					id: 'item_0',
					type: 'error',
					message:
						'Skill descriptions were shortened to fit the 2% skills context budget.',
				},
			}),
			JSON.stringify({
				type: 'item.completed',
				item: { id: 'item_1', type: 'agent_message', text: 'Blocked pending approval.' },
			}),
			JSON.stringify({
				type: 'turn.completed',
				usage: { input_tokens: 10, output_tokens: 4 },
			}),
		].join('\n');
		const events = parseCodexBackendOutput(stdout, '', 0);

		expect(exitCodeFromEvents(events)).toBe(orchestratorExitCodes.success);
	});

	test('unspecified item errors remain fatal for exit classification', () => {
		const cases = [
			{
				expected: orchestratorExitCodes.providerError,
				message: 'Unexpected provider error.',
			},
			{ expected: orchestratorExitCodes.providerError, message: 'HTTP 401 invalid API key' },
			{ expected: orchestratorExitCodes.rateLimited, message: 'HTTP 429 Too many requests' },
		];

		for (const { expected, message } of cases) {
			const stdout = JSON.stringify({
				type: 'item.completed',
				item: { id: 'item_0', type: 'error', message },
			});
			const events = parseCodexBackendOutput(stdout, '', 0);
			const error = events.find((event) => event.type === 'error');

			expect(exitCodeFromEvents(events)).toBe(expected);
			if (error?.type !== 'error') throw new Error('expected error event');
			expect(error.fatal).toBeUndefined();
		}
	});

	test('turn.failed nested error payload is captured', () => {
		const nested = JSON.stringify({
			type: 'error',
			status: 400,
			error: {
				type: 'invalid_request_error',
				message: "The 'gpt-5.6-sol' model requires a newer version of Codex.",
			},
		});
		const line = JSON.stringify({ type: 'turn.failed', error: { message: nested } });
		const events = parseCodexBackendOutput(line, '', 1);
		const error = events.find((event) => event.type === 'error' && event.reason === 'provider');
		expect(error).toBeDefined();
		if (error?.type !== 'error') throw new Error('expected error event');
		expect(error.fatal).toBe(true);
		expect(JSON.stringify(error.meta)).toContain('requires a newer version of Codex');
	});

	test('nested 429 inside a JSON-encoded codex error classifies as rate limit', () => {
		const nested = JSON.stringify({
			type: 'error',
			status: 429,
			error: { type: 'rate_limit_error', message: 'Too many requests' },
		});
		const line = JSON.stringify({ type: 'error', message: nested });
		const events = parseCodexBackendOutput(line, '', 1);
		expect(
			events.some((event) => event.type === 'error' && event.reason === 'rate_limit')
		).toBe(true);
	});
});
