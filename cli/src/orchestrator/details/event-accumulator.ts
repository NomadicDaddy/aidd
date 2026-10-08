import type { AgentEvent } from 'aidd-shared/backends/types';

import { agentErrorFatality } from 'aidd-shared/backends/error-events';
import {
	bashToolPattern,
	commandFromArgs,
	editToolPattern,
	pathFromArgs,
	readToolPattern,
	writeToolPattern,
} from 'aidd-shared/orchestrator/details/tool-args';

import type { FinalCheckSummary, IterationError } from './types.ts';

import {
	classifyErrorText,
	classifyFinalCheckCommand,
	cleanProviderMessage,
	commandMatchesErrorType,
	commandOutputFailed,
	commandStatusKnown,
	finalCheckStatusFromOutput,
	isProviderExitFallbackMeta,
	providerErrorText,
	requestIdFromProviderText,
} from './classification.ts';
import { eventTextForClassification } from './shared.ts';

// What one iteration's event stream adds up to, one event at a time. The builder dispatches each
// event to the recorder for its type and reads the totals afterwards; the three recorders were
// one 100-line loop in builder.ts with a complexity of 66, and each branch is a separate concern.
export interface EventAccumulator {
	advisories: string[];
	commands: string[];
	commandStatusEvidence: boolean;
	errors: IterationError[];
	failedCommands: string[];
	filesCreated: string[];
	filesEdited: string[];
	filesRead: string[];
	finalChecks: FinalCheckSummary;
	/** The last bash command issued, awaiting its tool_result. */
	pendingCommand: string | undefined;
	providerError: { message: string; requestId?: string } | undefined;
	providerErrorPriority: number;
}

type ToolCallEvent = Extract<AgentEvent, { type: 'tool_call' }>;
type ToolResultEvent = Extract<AgentEvent, { type: 'tool_result' }>;
type AgentErrorEvent = Extract<AgentEvent, { type: 'error' }>;

export function createEventAccumulator(): EventAccumulator {
	return {
		advisories: [],
		commands: [],
		commandStatusEvidence: false,
		errors: [],
		failedCommands: [],
		filesCreated: [],
		filesEdited: [],
		filesRead: [],
		finalChecks: {},
		pendingCommand: undefined,
		providerError: undefined,
		providerErrorPriority: -1,
	};
}

export function recordToolCall(acc: EventAccumulator, event: ToolCallEvent): void {
	if (readToolPattern.test(event.tool)) {
		const path = pathFromArgs(event.args);
		if (path) acc.filesRead.push(path);
		return;
	}
	if (writeToolPattern.test(event.tool)) {
		const path = pathFromArgs(event.args);
		if (path) acc.filesCreated.push(path);
		return;
	}
	if (editToolPattern.test(event.tool)) {
		const path = pathFromArgs(event.args);
		if (path) acc.filesEdited.push(path);
		return;
	}
	if (!bashToolPattern.test(event.tool)) return;
	const command = commandFromArgs(event.args);
	if (!command) return;
	acc.commands.push(command);
	acc.pendingCommand = command;
}

// A result that answers a final-check command records that check's status; an exit code is
// authoritative, otherwise the output is read for one.
function recordFinalCheck(
	acc: EventAccumulator,
	command: string,
	text: string,
	exitCode: number | undefined,
): void {
	const check = classifyFinalCheckCommand(command);
	const status =
		exitCode === undefined
			? finalCheckStatusFromOutput(text)
			: exitCode === 0
				? 'passed'
				: 'failed';
	if (check !== undefined && status !== undefined) acc.finalChecks[check] = status;
	acc.pendingCommand = undefined;
}

// Failed by its exit code, or, with no exit code, by output that reads as a failure or by a
// diagnostic of the kind the command produces.
function commandFailed(
	text: string,
	exitCode: number | undefined,
	command: string | undefined,
	errorType: ReturnType<typeof classifyErrorText>,
): boolean {
	if (exitCode !== undefined) return exitCode !== 0;
	if (commandOutputFailed(text)) return true;
	return (
		command !== undefined &&
		errorType !== undefined &&
		commandMatchesErrorType(command, errorType)
	);
}

export function recordToolResult(acc: EventAccumulator, event: ToolResultEvent): void {
	const text = eventTextForClassification(event);
	if (text === undefined) return;
	const resultCommand = acc.pendingCommand;
	if (resultCommand !== undefined) recordFinalCheck(acc, resultCommand, text, event.exitCode);
	if (resultCommand !== undefined && (event.exitCode !== undefined || commandStatusKnown(text))) {
		acc.commandStatusEvidence = true;
	}
	const errorType = classifyErrorText(text);
	const failed = commandFailed(text, event.exitCode, resultCommand, errorType);
	if (resultCommand !== undefined && failed) acc.failedCommands.push(resultCommand);
	if (failed && errorType !== undefined) {
		acc.errors.push({ message: text.slice(0, 500), type: errorType });
	}
}

// Parsers attach the resolving action to a recognized advisory as `meta.advisory`; an advisory
// without one is pure noise and is dropped rather than reported as something to act on.
function advisoryFromMeta(meta: unknown): string | undefined {
	if (typeof meta !== 'object' || meta === null) return undefined;
	const advisory = (meta as Record<string, unknown>).advisory;
	return typeof advisory === 'string' && advisory.length > 0 ? advisory : undefined;
}

function recordProviderError(
	acc: EventAccumulator,
	event: AgentErrorEvent,
	text: string,
	fatality: ReturnType<typeof agentErrorFatality>,
): void {
	const isExitFallback = isProviderExitFallbackMeta(event.meta);
	const priority = isExitFallback ? 0 : fatality === 'unspecified' ? 1 : 2;
	// The generic {exitCode, stderr} error the parsers emit on process exit trails provider
	// diagnostics. Unspecified item errors outrank it, while an explicitly fatal terminal error
	// (codex turn.failed) outranks both.
	if (priority <= acc.providerErrorPriority) return;
	const providerText = providerErrorText(event.meta) ?? text;
	acc.providerError = { message: cleanProviderMessage(providerText) };
	const requestId = requestIdFromProviderText(providerText) ?? requestIdFromProviderText(text);
	if (requestId !== undefined) acc.providerError.requestId = requestId;
	acc.providerErrorPriority = priority;
}

export function recordAgentError(acc: EventAccumulator, event: AgentErrorEvent): void {
	const fatality = agentErrorFatality(event);
	// A nonfatal event is one a parser explicitly recognized as a known-benign advisory (e.g.
	// codex's skills-context-budget notice), so it never explains an outcome and is dropped
	// whatever the exit code. Reporting it as the provider error made advisories masquerade as
	// the cause of any non-success run that emitted nothing else — a run that failed on
	// missing_aidd_result read as "provider error: Skill descriptions were shortened…". No
	// provider error at all is the honest answer in that case.
	if (fatality === 'nonfatal') {
		const advisory = advisoryFromMeta(event.meta);
		if (advisory !== undefined) acc.advisories.push(advisory);
		return;
	}
	const text = eventTextForClassification(event) ?? event.reason;
	const classified = classifyErrorText(text);
	const fromProvider = event.reason === 'provider' || event.reason === 'provider_flagged';
	if (fromProvider) recordProviderError(acc, event, text, fatality);
	acc.errors.push({
		message: text.slice(0, 500),
		type: fromProvider ? 'provider' : (classified ?? 'general'),
	});
}
