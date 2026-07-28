import type { AgentErrorEvent, AgentErrorReason, AgentEvent } from '../types.ts';

import { finalizePlainBackend, type FinalizePlainBackendInput } from './plain.ts';
import { isRateLimitText } from './rate-limit-text.ts';

function tryJson(line: string): undefined | unknown {
	try {
		return JSON.parse(line);
	} catch {
		return undefined;
	}
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	return value as Record<string, unknown>;
}

function readString(value: unknown): string | undefined {
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

// Codex error messages are often a JSON-encoded string wrapping the real provider payload;
// check the decoded form too so nested 429s classify as rate limits.
function errorTextIsRateLimit(message: string | undefined): boolean {
	if (isRateLimitText(message)) return true;
	if (message === undefined) return false;
	const decoded = tryJson(message);
	return decoded !== undefined && isRateLimitText(JSON.stringify(decoded));
}

// Codex reports several benign configuration notices through the same item-error channel it uses
// for provider failures. They are not failures and must never explain a run's outcome, but some of
// them are worth an operator's attention, so each carries the action that resolves it. `advice`
// travels on the event's meta and is surfaced as an advisory, not an error.
const nonfatalItemDiagnostics: { advice?: string; pattern: RegExp }[] = [
	{
		advice:
			'Codex truncated its skill descriptions to fit its skills context budget, so the agent ' +
			'may not have seen every installed skill. If a skill it needed went unused, trim the ' +
			'installed skill set or raise the skills context budget in the Codex config.',
		pattern: /^Skill descriptions were shortened to fit the \d+% skills context budget\./i,
	},
	{
		advice:
			'Codex has no metadata for the requested model and fell back to defaults, so token ' +
			'accounting and context limits for this run are estimates. Check the model name against ' +
			'the installed Codex version.',
		pattern: /^Model metadata for .+ not found\. Defaulting to fallback metadata\b/i,
	},
];

function nonfatalItemDiagnostic(
	message: string | undefined,
): (typeof nonfatalItemDiagnostics)[number] | undefined {
	if (message === undefined) return undefined;
	return nonfatalItemDiagnostics.find((diagnostic) => diagnostic.pattern.test(message));
}

function parseUsage(usage: Record<string, unknown>): AgentEvent | undefined {
	const inputTokens = readNumber(usage.input_tokens) ?? readNumber(usage.prompt_tokens);
	const outputTokens = readNumber(usage.output_tokens) ?? readNumber(usage.completion_tokens);
	if (inputTokens === undefined && outputTokens === undefined) return undefined;
	const event: AgentEvent = { type: 'usage' };
	if (inputTokens !== undefined) event.inputTokens = inputTokens;
	if (outputTokens !== undefined) event.outputTokens = outputTokens;
	// cached_input_tokens is a subset of input_tokens (OpenAI Responses usage); captured so
	// the cost estimate can apply the cached discount instead of billing it twice. Likewise
	// reasoning_output_tokens is a subset of output_tokens (already priced at the output rate);
	// captured for visibility, priced at reasoningPerMtok=0 to avoid double-counting.
	const cachedTokens = readNumber(usage.cached_input_tokens);
	const reasoningTokens = readNumber(usage.reasoning_output_tokens);
	if (cachedTokens !== undefined) event.cachedTokens = cachedTokens;
	if (reasoningTokens !== undefined) event.reasoningTokens = reasoningTokens;
	return event;
}

function parseItemEvent(envelopeType: string, item: Record<string, unknown>): AgentEvent[] {
	const events: AgentEvent[] = [];
	const itemType = readString(item.type);
	if (itemType === 'agent_message') {
		const text = readString(item.text);
		if (text !== undefined && envelopeType === 'item.completed') {
			events.push({ chunk: text, type: 'assistant_text' });
		}
		return events;
	}
	if (itemType === 'command_execution') {
		const command = readString(item.command) ?? readString(item.cmd);
		if (command === undefined) return events;
		if (envelopeType === 'item.started') {
			// Carried through when present so a fan-out of one command across several checkouts is
			// not mistaken for the same command repeated. Codex omits it for same-directory calls.
			const cwd = readString(item.cwd) ?? readString(item.workdir);
			events.push({
				args: { command, ...(cwd === undefined ? {} : { cwd }) },
				tool: 'bash',
				type: 'tool_call',
			});
		} else if (envelopeType === 'item.completed') {
			const output = readString(item.aggregated_output);
			const exitCode = readNumber(item.exit_code) ?? readNumber(item.exitCode);
			if (output !== undefined || exitCode !== undefined) {
				events.push({
					...(exitCode === undefined ? {} : { exitCode }),
					result: output ?? '',
					tool: 'bash',
					type: 'tool_result',
				});
			}
		}
		return events;
	}
	if (itemType === 'file_change' || itemType === 'patch_apply') {
		const path = readString(item.path) ?? readString(item.file);
		if (path !== undefined) {
			events.push({ args: { path }, tool: 'edit', type: 'tool_call' });
		}
		return events;
	}
	if (itemType === 'error') {
		// Codex uses item errors for both known advisory diagnostics and real provider failures.
		// Mark only recognized advisories nonfatal. Other item errors remain unspecified so they
		// fail closed for exit classification but can yield to an explicitly fatal terminal error.
		const message = readString(item.message);
		const reason: AgentErrorReason = errorTextIsRateLimit(message) ? 'rate_limit' : 'provider';
		if (reason === 'rate_limit') events.push({ raw: item, type: 'rate_limit' });
		const diagnostic = nonfatalItemDiagnostic(message);
		const errorEvent: AgentErrorEvent = {
			meta: {
				...(diagnostic?.advice === undefined ? {} : { advisory: diagnostic.advice }),
				message,
				raw: item,
			},
			reason,
			type: 'error',
		};
		if (diagnostic !== undefined) errorEvent.fatal = false;
		events.push(errorEvent);
		return events;
	}
	return events;
}

function parseErrorEvent(json: Record<string, unknown>, fatal = true): AgentEvent[] {
	const events: AgentEvent[] = [];
	const message =
		readString(json.message) ??
		readString(asRecord(json.error)?.message) ??
		readString(json.error);
	const reason: AgentErrorReason = errorTextIsRateLimit(message) ? 'rate_limit' : 'provider';
	if (reason === 'rate_limit') events.push({ raw: json, type: 'rate_limit' });
	events.push({ fatal, meta: json, reason, type: 'error' });
	return events;
}

export function parseCodexBackendLine(line: string): AgentEvent[] {
	if (!line.trim()) return [];
	const json = asRecord(tryJson(line));
	if (json === undefined) return [];
	const envelopeType = readString(json.type);
	if (envelopeType === undefined) return [];

	if (envelopeType === 'turn.completed') {
		const usage = asRecord(json.usage);
		if (usage !== undefined) {
			const event = parseUsage(usage);
			return event === undefined ? [] : [event];
		}
		return [];
	}

	if (envelopeType === 'item.started' || envelopeType === 'item.completed') {
		const item = asRecord(json.item);
		if (item === undefined) return [];
		return parseItemEvent(envelopeType, item);
	}

	if (envelopeType === 'error' || json.is_error === true) {
		return parseErrorEvent(json);
	}

	if (envelopeType === 'turn.failed') {
		// The failure detail lives under json.error ({"type":"turn.failed","error":{"message":...}});
		// fall back to the envelope itself when absent. Marked fatal so it outranks earlier
		// item errors and advisories when surfaced.
		const detail = asRecord(json.error) ?? json;
		return parseErrorEvent(detail);
	}

	return [];
}

export function finalizeCodexBackend(input: FinalizePlainBackendInput): AgentEvent[] {
	return finalizePlainBackend(input);
}

export function parseCodexBackendOutput(
	stdout: string,
	stderr: string,
	exitCode: null | number,
): AgentEvent[] {
	const events: AgentEvent[] = [];
	const combined = [stdout, stderr].filter(Boolean).join('\n');
	for (const line of combined.split(/\r?\n/)) {
		events.push(...parseCodexBackendLine(line));
	}
	const sawAssistantText = events.some((event) => event.type === 'assistant_text');
	const sawRateLimit = events.some((event) => event.type === 'rate_limit');
	events.push(
		...finalizeCodexBackend({ exitCode, sawAssistantText, sawRateLimit, stderr, stdout }),
	);
	return events;
}
