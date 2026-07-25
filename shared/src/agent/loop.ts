import type { AgentEvent, PromptInput } from '../backends/types.ts';

import {
	type AgentClient,
	type AgentLoopRequest,
	type AgentLoopResponse,
	type AgentMessage,
	SimulationAgentClient,
} from './client.ts';
import {
	afterToolCalls,
	evaluateTextOnlyResponse,
	initialHeuristicState,
} from './heuristics/index.ts';
import { LiveDeltaPump } from './live-deltas.ts';
import { executeTool, toolDefinitions } from './tools/index.ts';

export interface AgentLoopOptions {
	client?: AgentClient;
	heuristicMode?: 'default' | 'planning';
	maxTurns?: number;
	signal?: AbortSignal;
	simulation?: boolean;
}

const zrunExitCodes = {
	aborted: 6,
	providerError: 8,
	success: 0,
} as const;

// Native zrun loop exit codes are internal agent-loop statuses, distinct from orchestratorExitCodes.
function isAbortError(error: unknown): boolean {
	return (
		(error instanceof DOMException && error.name === 'AbortError') ||
		(error instanceof Error && error.name === 'AbortError')
	);
}

export async function* runAgentLoop(
	input: PromptInput,
	options: AgentLoopOptions = {},
): AsyncIterable<AgentEvent> {
	const signal = options.signal ?? new AbortController().signal;
	const client = options.client ?? new SimulationAgentClient();
	const maxTurns = options.maxTurns ?? 25;
	const messages: AgentMessage[] = [{ content: input.text, role: 'user' }];
	const filesModified = new Set<string>();
	const heuristicMode = options.heuristicMode ?? input.heuristicMode ?? 'default';
	let heuristicState = initialHeuristicState();

	if (signal.aborted) {
		yield { meta: signal.reason, reason: 'aborted', type: 'error' };
		yield { exitCode: zrunExitCodes.aborted, filesModified: [], type: 'done' };
		return;
	}

	if (!input.text.trim()) {
		yield { meta: 'empty prompt', reason: 'provider', type: 'error' };
		yield { exitCode: zrunExitCodes.providerError, filesModified: [], type: 'done' };
		return;
	}

	try {
		for (let turn = 0; turn < maxTurns; turn++) {
			// One pump per turn: streams the in-flight completion's content/reasoning fragments
			// as live assistant_delta events (marker-gated) while complete() is still pending.
			const pump = new LiveDeltaPump();
			const request: AgentLoopRequest = {
				cwd: input.cwd,
				messages,
				prompt: input.text,
				tools: toolDefinitions,
				turn,
			};
			if (input.model !== undefined) {
				request.model = input.model;
			}
			if (input.reasoningEffort !== undefined) {
				request.reasoningEffort = input.reasoningEffort;
			}
			if (input.thinking !== undefined) {
				request.thinking = input.thinking;
			}
			if (input.thinkingLevel !== undefined) {
				request.thinkingLevel = input.thinkingLevel;
			}

			const response = yield* pump.run(client.complete(request, signal, pump.onDelta));

			for (const event of response.events ?? []) {
				yield event;
			}

			if (response.text) {
				yield { chunk: response.text, type: 'assistant_text' };
			}

			if (response.inputTokens !== undefined || response.outputTokens !== undefined) {
				yield usageEvent(response);
			}

			if (!response.toolCalls?.length) {
				messages.push({ content: response.text || null, role: 'assistant' });
				const heuristic = evaluateTextOnlyResponse(response.text, heuristicState, {
					mode: heuristicMode,
				});
				if (heuristic.action === 'nudge') {
					heuristicState = heuristic.state;
					yield {
						chunk: `[native] ${heuristic.reason}\n`,
						stream: 'stdout',
						type: 'raw_log',
					};
					messages.push({ content: heuristic.prompt, role: 'user' });
					continue;
				}
				if (heuristic.action === 'abort') {
					yield { meta: heuristic.reason, reason: 'provider', type: 'error' };
					yield {
						exitCode: zrunExitCodes.providerError,
						filesModified: [...filesModified, ...(response.filesModified ?? [])],
						type: 'done',
					};
					return;
				}
				yield {
					exitCode: zrunExitCodes.success,
					filesModified: [...filesModified, ...(response.filesModified ?? [])],
					type: 'done',
				};
				return;
			}

			messages.push({
				content: response.text || null,
				role: 'assistant',
				toolCalls: response.toolCalls,
			});

			for (const toolCall of response.toolCalls) {
				const args = parseToolArgs(toolCall.arguments);
				yield { args, tool: toolCall.name, type: 'tool_call' };
				const result = await executeTool(
					toolCall.name,
					toolCall.arguments,
					input.cwd,
					options.simulation,
				);
				trackModifiedFile(filesModified, toolCall.name, args);
				yield { result, tool: toolCall.name, type: 'tool_result' };
				messages.push({
					content: result,
					role: 'tool',
					toolCallId: toolCall.id,
				});
			}

			const afterTools = afterToolCalls(
				heuristicState,
				response.toolCalls.map((toolCall) => toolCall.name),
			);
			heuristicState = afterTools.state;
			if (afterTools.nudge?.action === 'nudge') {
				yield {
					chunk: `[native] ${afterTools.nudge.reason}\n`,
					stream: 'stdout',
					type: 'raw_log',
				};
				messages.push({ content: afterTools.nudge.prompt, role: 'user' });
			}
		}

		yield { meta: `max turns reached: ${maxTurns}`, reason: 'provider', type: 'error' };
		yield {
			exitCode: zrunExitCodes.providerError,
			filesModified: [...filesModified],
			type: 'done',
		};
	} catch (error) {
		if (isAbortError(error) || signal.aborted) {
			yield { meta: signal.reason, reason: 'aborted', type: 'error' };
			yield { exitCode: zrunExitCodes.aborted, filesModified: [], type: 'done' };
			return;
		}

		yield {
			meta: error instanceof Error ? error.message : error,
			reason: 'provider',
			type: 'error',
		};
		yield { exitCode: zrunExitCodes.providerError, filesModified: [], type: 'done' };
	}
}

function usageEvent(response: AgentLoopResponse): AgentEvent {
	const usage: AgentEvent = { type: 'usage' };
	if (response.inputTokens !== undefined) {
		usage.inputTokens = response.inputTokens;
	}
	if (response.outputTokens !== undefined) {
		usage.outputTokens = response.outputTokens;
	}
	if (response.cachedTokens !== undefined) {
		usage.cachedTokens = response.cachedTokens;
	}
	if (response.reasoningTokens !== undefined) {
		usage.reasoningTokens = response.reasoningTokens;
	}
	return usage;
}

function parseToolArgs(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
}

function trackModifiedFile(filesModified: Set<string>, tool: string, args: unknown): void {
	if (tool !== 'write_file' && tool !== 'edit_file') return;
	if (typeof args !== 'object' || args === null || !('path' in args)) return;
	const path = args.path;
	if (typeof path === 'string') filesModified.add(path);
}
