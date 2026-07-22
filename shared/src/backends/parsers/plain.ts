import type { AgentEvent, AgentErrorReason } from '../types.ts';

import { isRateLimitText } from './rate-limit-text.ts';

function tryJson(line: string): undefined | unknown {
	try {
		return JSON.parse(line);
	} catch {
		return undefined;
	}
}

function getPath(value: unknown, path: string[]): unknown {
	let current = value;
	for (const segment of path) {
		if (typeof current !== 'object' || current === null || !(segment in current))
			return undefined;
		current = (current as Record<string, unknown>)[segment];
	}
	return current;
}

function firstString(value: unknown, paths: string[][]): string | undefined {
	for (const path of paths) {
		const candidate = getPath(value, path);
		if (typeof candidate === 'string' && candidate.length > 0) return candidate;
	}
	return undefined;
}

function firstNumber(value: unknown, paths: string[][]): number | undefined {
	for (const path of paths) {
		const candidate = getPath(value, path);
		if (typeof candidate === 'number') return candidate;
	}
	return undefined;
}

function isCommandExecutionStartJson(json: unknown): boolean {
	const type = firstString(json, [['type'], ['item', 'type']]);
	return type === 'command_execution';
}

function commandExecutionName(json: unknown): string | undefined {
	return firstString(json, [['command'], ['cmd'], ['item', 'command'], ['item', 'cmd']]);
}

function parseTaggedLine(line: string): AgentEvent | undefined {
	if (line.startsWith('[ASSISTANT]')) {
		return { chunk: line.replace(/^\[ASSISTANT\]\s*/, ''), type: 'assistant_text' };
	}
	if (line.startsWith('[TOOL USE]')) {
		return { args: undefined, tool: line.replace(/^\[TOOL USE\]\s*/, ''), type: 'tool_call' };
	}
	if (line.startsWith('[TOOL RESULT]')) {
		return {
			result: line.replace(/^\[TOOL RESULT\]\s*/, ''),
			tool: 'unknown',
			type: 'tool_result',
		};
	}
	if (line.startsWith('[RATE_LIMITED]')) {
		return { raw: line, type: 'rate_limit' };
	}
	return undefined;
}

function parseContentBlocks(json: unknown): AgentEvent[] {
	const events: AgentEvent[] = [];
	const content = getPath(json, ['message', 'content']) ?? getPath(json, ['content']);
	if (!Array.isArray(content)) return events;
	for (const block of content) {
		if (typeof block !== 'object' || block === null) continue;
		const blockType = (block as Record<string, unknown>).type;
		if (blockType === 'text') {
			const text = (block as Record<string, unknown>).text;
			if (typeof text === 'string' && text.length > 0) {
				events.push({ chunk: text, type: 'assistant_text' });
			}
		} else if (blockType === 'tool_use') {
			const name = (block as Record<string, unknown>).name;
			if (typeof name === 'string') {
				events.push({
					args: (block as Record<string, unknown>).input,
					tool: name,
					type: 'tool_call',
				});
			}
		} else if (blockType === 'tool_result') {
			const result = (block as Record<string, unknown>).content;
			if (result !== undefined) {
				events.push({ result, tool: 'unknown', type: 'tool_result' });
			}
		}
	}
	return events;
}

// Claude Code stream-json emits a first-class rate_limit_event carrying the reset epoch;
// only a rejected status means the run is actually throttled (warnings arrive with other
// statuses while the run keeps working).
function parseRateLimitEvent(json: unknown): AgentEvent | undefined {
	const status = firstString(json, [['rate_limit_info', 'status'], ['status']]);
	if (status !== 'rejected') return undefined;
	const resetsAt = firstNumber(json, [['rate_limit_info', 'resetsAt'], ['resetsAt']]);
	return {
		raw: json,
		type: 'rate_limit',
		...(resetsAt !== undefined ? { resetAt: new Date(resetsAt * 1000).toISOString() } : {}),
	};
}

function parseJsonLine(json: unknown): AgentEvent[] {
	const events: AgentEvent[] = [];
	const type = firstString(json, [['type']]);
	if (type === 'rate_limit_event') {
		const event = parseRateLimitEvent(json);
		return event === undefined ? [] : [event];
	}
	const commandExecution = isCommandExecutionStartJson(json);
	const command = commandExecutionName(json);
	if (commandExecution && command) {
		events.push({ args: { command }, tool: 'bash', type: 'tool_call' });
	}
	const blockEvents = parseContentBlocks(json);
	if (blockEvents.length > 0) {
		events.push(...blockEvents);
	}
	const assistant = firstString(json, [
		['delta'],
		['text'],
		['message'],
		['content'],
		['output_text'],
		['result'],
		['item', 'text'],
		['item', 'delta'],
		['item', 'message'],
	]);
	if (assistant && type !== 'error') events.push({ chunk: assistant, type: 'assistant_text' });

	const tool = firstString(json, [
		['tool_name'],
		['name'],
		['tool', 'name'],
		['call', 'name'],
		['item', 'name'],
		['item', 'tool_name'],
	]);
	if (tool) {
		events.push({
			args:
				getPath(json, ['arguments']) ??
				getPath(json, ['input']) ??
				getPath(json, ['args']) ??
				getPath(json, ['item', 'arguments']) ??
				getPath(json, ['item', 'input']),
			tool,
			type: 'tool_call',
		});
	}

	const toolResult =
		getPath(json, ['output']) ??
		getPath(json, ['item', 'output']) ??
		getPath(json, ['item', 'result']);
	if (toolResult !== undefined) {
		events.push({
			result: toolResult,
			tool: tool ?? (command ? 'bash' : 'unknown'),
			type: 'tool_result',
		});
	}

	const inputTokens = firstNumber(json, [
		['usage', 'input_tokens'],
		['usage', 'prompt_tokens'],
		['message', 'usage', 'input_tokens'],
	]);
	const outputTokens = firstNumber(json, [
		['usage', 'output_tokens'],
		['usage', 'completion_tokens'],
		['message', 'usage', 'output_tokens'],
	]);
	const costUsd = firstNumber(json, [['total_cost_usd'], ['usage', 'cost_usd']]);
	if (inputTokens !== undefined || outputTokens !== undefined || costUsd !== undefined) {
		const usage: AgentEvent = { type: 'usage' };
		if (inputTokens !== undefined) usage.inputTokens = inputTokens;
		if (outputTokens !== undefined) usage.outputTokens = outputTokens;
		if (costUsd !== undefined) usage.costUsd = costUsd;
		events.push(usage);
	}

	const errorMessage = firstString(json, [
		['message'],
		['error'],
		['error', 'message'],
		['result'],
	]);
	if (type === 'error' || getPath(json, ['is_error']) === true) {
		const rateLimited =
			isRateLimitText(errorMessage) ||
			getPath(json, ['api_error_status']) === 429 ||
			getPath(json, ['error']) === 'rate_limit';
		if (rateLimited) {
			events.push({ raw: json, type: 'rate_limit' });
			events.push({ meta: json, reason: 'rate_limit', type: 'error' });
		} else {
			events.push({ meta: json, reason: 'provider', type: 'error' });
		}
	}
	return events;
}

export function parsePlainBackendLine(line: string): AgentEvent[] {
	if (!line.trim()) return [];
	const tagged = parseTaggedLine(line);
	if (tagged) return [tagged];
	const json = tryJson(line);
	if (json !== undefined) return parseJsonLine(json);
	return [];
}

export interface FinalizePlainBackendInput {
	exitCode: null | number;
	sawAssistantText: boolean;
	sawRateLimit: boolean;
	stderr: string;
	stdout: string;
}

export function finalizePlainBackend(input: FinalizePlainBackendInput): AgentEvent[] {
	const { exitCode, sawAssistantText, sawRateLimit, stderr, stdout } = input;
	const combined = [stdout, stderr].filter(Boolean).join('\n');
	const events: AgentEvent[] = [];
	if (!sawAssistantText && stdout.trim()) {
		events.push({ chunk: stdout, type: 'assistant_text' });
	}
	if (isRateLimitText(combined) && !sawRateLimit) {
		events.push({ raw: combined, type: 'rate_limit' });
	}
	if ((exitCode ?? 1) !== 0) {
		// Honor structured rate-limit events seen during the stream: exitCodeFromEvents reads
		// the LAST error, so this trailing exit-fallback must not downgrade a throttled run
		// back to a generic provider error.
		const reason: AgentErrorReason =
			sawRateLimit || isRateLimitText(combined) ? 'rate_limit' : 'provider';
		events.push({ meta: { exitCode, stderr }, reason, type: 'error' });
	}
	events.push({ exitCode: exitCode ?? 1, filesModified: [], type: 'done' });
	return events;
}

export function parsePlainBackendOutput(
	stdout: string,
	stderr: string,
	exitCode: null | number
): AgentEvent[] {
	const events: AgentEvent[] = [];
	const combined = [stdout, stderr].filter(Boolean).join('\n');
	for (const line of combined.split(/\r?\n/)) {
		events.push(...parsePlainBackendLine(line));
	}
	const sawAssistantText = events.some((event) => event.type === 'assistant_text');
	const sawRateLimit = events.some((event) => event.type === 'rate_limit');
	events.push(
		...finalizePlainBackend({ exitCode, sawAssistantText, sawRateLimit, stderr, stdout })
	);
	return events;
}
