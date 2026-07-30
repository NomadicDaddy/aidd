import { describe, expect, test } from 'bun:test';
import { parseClineBackendLine, parseClineBackendOutput } from 'aidd-shared/backends/parsers/cline';
import { parseCodexBackendLine, parseCodexBackendOutput } from 'aidd-shared/backends/parsers/codex';
import { parseOpencodeFamilyOutput } from 'aidd-shared/backends/parsers/opencode-family';
import { parsePlainBackendOutput } from 'aidd-shared/backends/parsers/plain';
import { exitCodeFromEvents, orchestratorExitCodes } from 'aidd-shared/orchestrator/result';

describe('backend parser', () => {
	test('classifies rate limits', () => {
		const events = parsePlainBackendOutput('', 'hit your rate limit', 1);
		expect(events.some((event) => event.type === 'rate_limit')).toBe(true);
		expect(
			events.some((event) => event.type === 'error' && event.reason === 'rate_limit'),
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
			1,
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
			0,
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
			0,
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
			0,
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
			}),
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
			0,
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
			0,
		);
		const usage = events.find((event) => event.type === 'usage');
		expect(usage).toBeDefined();
		if (usage?.type !== 'usage') throw new Error('expected usage event');
		expect(usage.inputTokens).toBe(15329); // 15265 fresh + 64 cache.read
		expect(usage.cachedTokens).toBe(64);
		expect(usage.outputTokens).toBe(3);
	});
});

describe('cline structured output', () => {
	test('normalizes modern deltas, tools, aggregate usage, and canonical text', () => {
		const stdout = [
			JSON.stringify({
				type: 'agent_event',
				event: { type: 'content_start', contentType: 'text', text: 'Working' },
			}),
			JSON.stringify({
				type: 'agent_event',
				event: {
					type: 'content_start',
					contentType: 'reasoning',
					reasoning: 'Checking',
				},
			}),
			JSON.stringify({
				type: 'agent_event',
				event: {
					type: 'content_start',
					contentType: 'tool',
					toolName: 'run_commands',
					input: { commands: ['bun test'] },
				},
			}),
			JSON.stringify({
				type: 'agent_event',
				event: {
					type: 'content_end',
					contentType: 'tool',
					toolName: 'run_commands',
					output: '1 pass',
				},
			}),
			JSON.stringify({
				type: 'run_result',
				finishReason: 'completed',
				text: 'Done',
				usage: { inputTokens: 2, outputTokens: 1 },
				aggregateUsage: {
					inputTokens: 120,
					outputTokens: 30,
					cacheReadTokens: 80,
					cacheWriteTokens: 10,
					totalCost: 0.25,
				},
			}),
		].join('\n');
		const events = parseClineBackendOutput(stdout, '', 0);

		expect(events).toContainEqual({
			chunk: 'Working',
			kind: 'text',
			type: 'assistant_delta',
		});
		expect(events).toContainEqual({
			chunk: 'Checking',
			kind: 'reasoning',
			type: 'assistant_delta',
		});
		expect(events).toContainEqual({
			args: { commands: ['bun test'] },
			tool: 'run_commands',
			type: 'tool_call',
		});
		expect(events).toContainEqual({
			result: '1 pass',
			tool: 'run_commands',
			type: 'tool_result',
		});
		expect(events.filter((event) => event.type === 'assistant_text')).toEqual([
			{ chunk: 'Done', type: 'assistant_text' },
		]);
		expect(events).toContainEqual({
			cachedTokens: 80,
			costUsd: 0.25,
			inputTokens: 120,
			outputTokens: 30,
			type: 'usage',
		});
	});

	test('streams per-iteration usage and reconciles it against the run aggregate', () => {
		// Shapes taken from a real cline 3.0.47 three-iteration run: the non-prefixed fields are
		// per-turn, total* are cumulative, and aggregateUsage equals the per-turn sum.
		const events = parseClineBackendOutput(
			[
				JSON.stringify({
					type: 'agent_event',
					event: {
						type: 'usage',
						inputTokens: 5768,
						outputTokens: 339,
						cacheReadTokens: 0,
						cost: 0.0095668,
						totalInputTokens: 5768,
						totalOutputTokens: 339,
						totalCacheReadTokens: 0,
						totalCost: 0.0095668,
					},
				}),
				JSON.stringify({
					type: 'agent_event',
					event: {
						type: 'usage',
						inputTokens: 6177,
						outputTokens: 100,
						cacheReadTokens: 5760,
						cost: 0.0025214,
						totalInputTokens: 11945,
						totalOutputTokens: 439,
						totalCacheReadTokens: 5760,
						totalCost: 0.0120882,
					},
				}),
				JSON.stringify({
					type: 'run_result',
					finishReason: 'completed',
					text: 'Done',
					aggregateUsage: {
						inputTokens: 11945,
						outputTokens: 439,
						cacheReadTokens: 5760,
						totalCost: 0.0120882,
					},
				}),
			].join('\n'),
			'',
			0,
		);

		const usage = events.filter((event) => event.type === 'usage');
		// Live usage arrives per iteration rather than only at the end.
		expect(usage.length).toBe(2);
		expect(usage[0]).toEqual({
			cachedTokens: 0,
			costUsd: 0.0095668,
			inputTokens: 5768,
			outputTokens: 339,
			type: 'usage',
		});
		// Totals are summed downstream, so the aggregate must not be re-emitted on top of the
		// per-iteration events it already covers.
		const summed = usage.reduce(
			(acc, event) => ({
				cachedTokens: acc.cachedTokens + (event.cachedTokens ?? 0),
				costUsd: acc.costUsd + (event.costUsd ?? 0),
				inputTokens: acc.inputTokens + (event.inputTokens ?? 0),
				outputTokens: acc.outputTokens + (event.outputTokens ?? 0),
			}),
			{ cachedTokens: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 },
		);
		expect(summed.inputTokens).toBe(11945);
		expect(summed.outputTokens).toBe(439);
		expect(summed.cachedTokens).toBe(5760);
		expect(summed.costUsd).toBeCloseTo(0.0120882, 9);
	});

	test('tops the running usage sum up to a larger run aggregate', () => {
		const events = parseClineBackendOutput(
			[
				JSON.stringify({
					type: 'agent_event',
					event: { type: 'usage', inputTokens: 40, outputTokens: 5, cost: 0.01 },
				}),
				JSON.stringify({
					type: 'run_result',
					finishReason: 'completed',
					text: 'Done',
					// A missing or unparseable iteration line must not lose tokens: cline's
					// aggregate stays authoritative and the remainder is emitted.
					aggregateUsage: { inputTokens: 100, outputTokens: 20, totalCost: 0.05 },
				}),
			].join('\n'),
			'',
			0,
		);
		const usage = events.filter((event) => event.type === 'usage');
		expect(usage.length).toBe(2);
		expect(usage[1]).toEqual({
			costUsd: 0.04,
			inputTokens: 60,
			outputTokens: 15,
			type: 'usage',
		});
	});

	test('keeps per-iteration usage when the run dies before a run result', () => {
		const events = parseClineBackendOutput(
			JSON.stringify({
				type: 'agent_event',
				event: { type: 'usage', inputTokens: 77, outputTokens: 9, cost: 0.02 },
			}),
			'',
			1,
		);
		expect(events).toContainEqual({
			costUsd: 0.02,
			inputTokens: 77,
			outputTokens: 9,
			type: 'usage',
		});
	});

	test('keeps tool errors as tool results and ignores recoverable agent errors', () => {
		const tool = parseClineBackendLine(
			JSON.stringify({
				type: 'agent_event',
				event: {
					type: 'content_end',
					contentType: 'tool',
					toolName: 'run_commands',
					error: 'command failed',
				},
			}),
		);
		expect(tool).toEqual([
			{ result: 'command failed', tool: 'run_commands', type: 'tool_result' },
		]);

		const recoverable = parseClineBackendLine(
			JSON.stringify({
				type: 'agent_event',
				event: { type: 'error', recoverable: true, error: { message: 'retrying' } },
			}),
		);
		expect(recoverable).toEqual([]);
	});

	test('classifies unsuccessful run results and rate limits', () => {
		const events = parseClineBackendOutput(
			JSON.stringify({
				type: 'run_result',
				finishReason: 'error',
				text: '429 rate limit exceeded',
			}),
			'',
			1,
		);
		expect(events.some((event) => event.type === 'rate_limit')).toBe(true);
		expect(
			events.some((event) => event.type === 'error' && event.reason === 'rate_limit'),
		).toBe(true);
	});

	test('supports legacy partial and completed say events', () => {
		const events = parseClineBackendOutput(
			[
				JSON.stringify({ type: 'say', text: 'Work', partial: true }),
				JSON.stringify({ type: 'ask', reasoning: 'Why', partial: true }),
				JSON.stringify({ type: 'say', text: 'Superseded', partial: false }),
				JSON.stringify({ type: 'say', text: 'Finished', partial: false }),
			].join('\n'),
			'',
			0,
		);
		expect(events).toContainEqual({
			chunk: 'Work',
			kind: 'text',
			type: 'assistant_delta',
		});
		expect(events).toContainEqual({
			chunk: 'Why',
			kind: 'reasoning',
			type: 'assistant_delta',
		});
		expect(events).toContainEqual({ chunk: 'Finished', type: 'assistant_text' });
		expect(events).not.toContainEqual({ chunk: 'Superseded', type: 'assistant_text' });
	});

	test('lets the final modern result override legacy completions', () => {
		const events = parseClineBackendOutput(
			[
				JSON.stringify({ partial: false, text: 'Legacy', type: 'say' }),
				JSON.stringify({
					finishReason: 'completed',
					text: 'Modern',
					type: 'run_result',
				}),
			].join('\n'),
			'',
			0,
		);
		expect(events).toContainEqual({ chunk: 'Modern', type: 'assistant_text' });
		expect(events).not.toContainEqual({ chunk: 'Legacy', type: 'assistant_text' });
	});

	test('preserves a modern stream with no run result through the shared finalizer', () => {
		const stdout = JSON.stringify({
			event: { contentType: 'text', text: 'Partial', type: 'content_start' },
			type: 'agent_event',
		});
		const events = parseClineBackendOutput(stdout, '', 0);
		expect(events).toContainEqual({
			chunk: 'Partial',
			kind: 'text',
			type: 'assistant_delta',
		});
		expect(events).toContainEqual({ chunk: stdout, type: 'assistant_text' });
	});

	test('preserves malformed stdout and reports provider failure', () => {
		const events = parseClineBackendOutput('not-json', 'Cline failed', 1);
		expect(events).toContainEqual({ chunk: 'not-json', type: 'assistant_text' });
		expect(events.some((event) => event.type === 'error' && event.reason === 'provider')).toBe(
			true,
		);
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
			events.some((event) => event.type === 'error' && event.reason === 'rate_limit'),
		).toBe(true);
		expect(events.some((event) => event.type === 'error' && event.reason === 'provider')).toBe(
			false,
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
			events.some((event) => event.type === 'error' && event.reason === 'rate_limit'),
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

	test('recognized nonfatal diagnostics carry the resolving action as an advisory', () => {
		const cases = [
			{
				expected: 'skills context budget',
				message: 'Skill descriptions were shortened to fit the 2% skills context budget.',
			},
			{
				expected: 'token accounting',
				message:
					'Model metadata for `gpt-5.6-sol` not found. Defaulting to fallback metadata.',
			},
		];

		for (const { expected, message } of cases) {
			const stdout = JSON.stringify({
				type: 'item.completed',
				item: { id: 'item_0', type: 'error', message },
			});
			const error = parseCodexBackendOutput(stdout, '', 0).find(
				(event) => event.type === 'error',
			);
			if (error?.type !== 'error') throw new Error('expected error event');
			const advisory = (error.meta as { advisory?: string } | undefined)?.advisory;
			expect(advisory).toContain(expected);
		}
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
			events.some((event) => event.type === 'error' && event.reason === 'rate_limit'),
		).toBe(true);
	});
});
