import type { AgentEvent } from '../backends/types.ts';
import type { SelectedWork } from '../modes/types.ts';

import { extractMalformedResultMarker, extractResultFromText } from '../agent/result-marker.ts';
import { isFatalAgentError } from '../backends/error-events.ts';
import {
	canonicalToolName,
	editToolPattern,
	pathFromArgs,
	writeToolPattern,
} from './details/tool-args.ts';
import { orchestratorExitCodes } from './exit-codes.ts';

export { describeOrchestratorExitCode, orchestratorExitCodes } from './exit-codes.ts';

export interface AgentRunResult {
	events: AgentEvent[];
	exitCode: number;
	filesModified: string[];
	selectedWork?: SelectedWork;
	skipped?: boolean;
	structuredResult?: Record<string, unknown>;
	transcript: string;
}

export function extractStructuredResult(events: AgentEvent[]): Record<string, unknown> | undefined {
	return extractResultFromText(assistantText(events));
}

/**
 * True when the agent emitted a brace-balanced but unparseable `AIDD_RESULT:` marker (a
 * placeholder such as `AIDD_RESULT: { … }`) and no later valid marker rescued it. The native
 * loop nudges a re-emit while the turn is live; CLI backends have no such lever, so the
 * orchestrator uses this to report the real cause instead of the generic "no marker emitted".
 */
export function hasMalformedResultMarker(events: AgentEvent[]): boolean {
	return extractMalformedResultMarker(assistantText(events));
}

function assistantText(events: AgentEvent[]): string {
	return events
		.filter((event) => event.type === 'assistant_text')
		.map((event) => (event.type === 'assistant_text' ? event.chunk : ''))
		.join('\n');
}

export function exitCodeFromEvents(events: AgentEvent[]): number {
	const done = [...events].reverse().find((event) => event.type === 'done');
	const successfulDone = done?.type === 'done' && done.exitCode === orchestratorExitCodes.success;
	const error = [...events]
		.reverse()
		.find((event) => event.type === 'error' && !(successfulDone && !isFatalAgentError(event)));
	if (error?.type === 'error') {
		switch (error.reason) {
			case 'aborted':
				return orchestratorExitCodes.aborted;
			case 'idle':
				return orchestratorExitCodes.idleTimeout;
			case 'parse':
			case 'provider':
			case 'spawn':
			case 'unknown':
				return orchestratorExitCodes.providerError;
			case 'rate_limit':
				return orchestratorExitCodes.rateLimited;
		}
	}

	if (successfulDone) {
		return orchestratorExitCodes.success;
	}

	if (events.some((event) => event.type === 'rate_limit'))
		return orchestratorExitCodes.rateLimited;
	return done?.type === 'done' ? done.exitCode : orchestratorExitCodes.generalError;
}

export function filesModifiedFromEvents(events: AgentEvent[]): string[] {
	const done = [...events].reverse().find((event) => event.type === 'done');
	return done?.type === 'done' ? done.filesModified : [];
}

export interface IterationMetrics {
	cachedTokens: number;
	costUsd: number;
	errorCount: number;
	errorReasons: string[];
	filesCreatedCount: number;
	filesEditedCount: number;
	idleWarningCount: number;
	inputTokens: number;
	outputTokens: number;
	rateLimitCount: number;
	reasoningTokens: number;
	toolBreakdown: Record<string, number>;
	toolCallCount: number;
}

export type StopReason =
	| 'blocked_dirty_worktree'
	| 'blocked_needs_user_input'
	| 'blocked'
	| 'completed'
	| 'exit_error'
	| 'flailing'
	| 'max_iterations'
	| 'merge_conflict_parked'
	| 'no_work'
	| 'partial_success_blocked'
	| 'stop_requested';

export function metricsFromEvents(events: AgentEvent[]): IterationMetrics {
	let toolCallCount = 0;
	const toolBreakdown: Record<string, number> = {};
	let cachedTokens = 0;
	let inputTokens = 0;
	let outputTokens = 0;
	let reasoningTokens = 0;
	let costUsd = 0;
	let errorCount = 0;
	let idleWarningCount = 0;
	let rateLimitCount = 0;
	const errorReasons: string[] = [];
	const editedPaths = new Set<string>();
	const createdPaths = new Set<string>();
	for (const event of events) {
		if (event.type === 'tool_call') {
			toolCallCount++;
			const canonicalTool = canonicalToolName(event.tool);
			toolBreakdown[canonicalTool] = (toolBreakdown[canonicalTool] ?? 0) + 1;
			if (editToolPattern.test(event.tool)) {
				const path = pathFromArgs(event.args);
				if (path) editedPaths.add(path);
			} else if (writeToolPattern.test(event.tool)) {
				const path = pathFromArgs(event.args);
				if (path) createdPaths.add(path);
			}
		} else if (event.type === 'usage') {
			if (event.cachedTokens !== undefined) cachedTokens += event.cachedTokens;
			if (event.inputTokens !== undefined) inputTokens += event.inputTokens;
			if (event.outputTokens !== undefined) outputTokens += event.outputTokens;
			if (event.reasoningTokens !== undefined) reasoningTokens += event.reasoningTokens;
			if (event.costUsd !== undefined) costUsd += event.costUsd;
		} else if (event.type === 'error' && isFatalAgentError(event)) {
			errorCount++;
			errorReasons.push(event.reason);
		} else if (event.type === 'idle_warning') idleWarningCount++;
		else if (event.type === 'rate_limit') rateLimitCount++;
	}
	return {
		cachedTokens,
		costUsd,
		errorCount,
		errorReasons,
		filesCreatedCount: createdPaths.size,
		filesEditedCount: editedPaths.size,
		idleWarningCount,
		inputTokens,
		outputTokens,
		rateLimitCount,
		reasoningTokens,
		toolBreakdown,
		toolCallCount,
	};
}
