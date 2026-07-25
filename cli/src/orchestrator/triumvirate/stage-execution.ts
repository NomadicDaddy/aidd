import type { AgentEvent, PromptInput } from 'aidd-shared/backends/types';
import type { RunPlan, TriumvirateRolePlan } from 'aidd-shared/plan/types';

import { monitorBackend } from 'aidd-shared/backends/monitor';
import {
	type AgentRunResult,
	exitCodeFromEvents,
	extractStructuredResult,
	filesModifiedFromEvents,
	type IterationMetrics,
	metricsFromEvents,
} from 'aidd-shared/orchestrator/result';

import type {
	StageRunInput,
	StageRunResult,
	TriumvirateCwdKind,
	TriumvirateRunOptions,
	TriumvirateStageArtifact,
	TriumvirateStageName,
} from './types.ts';

import {
	formatBackendStarted,
	formatIdleWarningLine,
	formatThinkingLine,
	formatToolArgs,
} from '../formatters.ts';
import { OrchestratorProgressReporter } from '../progress.ts';
import { summarizeSelectedWork } from './metadata.ts';

export function runStageWithOptions(
	options: TriumvirateRunOptions,
	stageInput: {
		cwd: string;
		cwdKind: TriumvirateCwdKind;
		prompt: string;
		role: TriumvirateRolePlan;
		stage: TriumvirateStageName;
	},
): Promise<StageRunResult> {
	return runStage({
		backend: options.backendFactory(stageInput.role.backend),
		cwd: stageInput.cwd,
		cwdKind: stageInput.cwdKind,
		plan: options.plan,
		prompt: stageInput.prompt,
		role: stageInput.role,
		stage: stageInput.stage,
		work: options.work,
		...(options.iteration !== undefined ? { iteration: options.iteration } : {}),
		...(options.onAgentEvent ? { onAgentEvent: options.onAgentEvent } : {}),
		...(options.runStartedAtMs !== undefined ? { runStartedAtMs: options.runStartedAtMs } : {}),
	});
}

export async function runStage(input: StageRunInput): Promise<StageRunResult> {
	process.stdout.write(`\n[triumvirate] ${input.stage} starting with ${input.role.backend}\n`);
	const startedAtMs = Date.now();
	const startedAt = new Date(startedAtMs).toISOString();
	const controller = new AbortController();
	const events: AgentEvent[] = [];
	const progress = new OrchestratorProgressReporter({
		backend: input.role.backend,
		...(input.iteration !== undefined ? { iteration: input.iteration } : {}),
		iterationStartedAtMs: startedAtMs,
		runStartedAtMs: input.runStartedAtMs ?? startedAtMs,
		stagePrefix: `triumvirate_${input.stage}`,
	});
	progress.start();
	progress.setStage('waiting_for_backend', { last: input.cwdKind });
	try {
		for await (const event of monitorBackend(
			input.backend,
			buildPromptInput(input.plan, input.role, input.cwd, input.prompt, input.cwdKind),
			controller.signal,
			{
				idleNudgeTimeoutMs: input.plan.outputPolicy.idleNudgeTimeoutSeconds * 1000,
				idleTimeoutMs: input.plan.outputPolicy.idleTimeoutSeconds * 1000,
			},
		)) {
			// Live deltas duplicate the turn's final assistant_text — observer/progress only,
			// never the persisted transcript (see backend-stream.ts for the same rule).
			if (event.type !== 'assistant_delta') events.push(event);
			progress.recordAgentEvent(event);
			await input.onAgentEvent?.(event);
			if (event.type === 'started') {
				process.stdout.write(formatBackendStarted(event.backend, event.pid));
				process.stdout.write(formatThinkingLine(event.backend));
			} else if (event.type === 'idle_warning') {
				process.stdout.write(formatIdleWarningLine(event.afterMs));
			} else if (event.type === 'assistant_text') {
				process.stdout.write(event.chunk.endsWith('\n') ? event.chunk : `${event.chunk}\n`);
			} else if (event.type === 'tool_call') {
				process.stdout.write(`· ${event.tool}${formatToolArgs(event.args)}\n`);
			}
		}
		progress.setStage('stage_complete', { last: `events ${events.length}` });
	} finally {
		progress.stop();
	}
	const endedAtMs = Date.now();
	const structuredResult = extractStructuredResult(events);
	const stageMetrics = metricsFromEvents(events);
	const result: AgentRunResult = {
		events,
		exitCode: exitCodeFromEvents(events),
		filesModified: filesModifiedFromEvents(events),
		selectedWork: input.work,
		transcript: events.map((event) => JSON.stringify(event)).join('\n'),
	};
	if (structuredResult) result.structuredResult = structuredResult;
	const artifact: TriumvirateStageArtifact = {
		assistantText: assistantText(events),
		backend: input.role.backend,
		cwdKind: input.cwdKind,
		durationMs: endedAtMs - startedAtMs,
		endedAt: new Date(endedAtMs).toISOString(),
		exitCode: result.exitCode,
		metrics: stageMetrics,
		promptChars: input.prompt.length,
		role: input.stage,
		selectedWork: summarizeSelectedWork(input.work),
		stage: input.stage,
		startedAt,
		transcript: result.transcript,
	};
	if (input.role.model !== undefined) artifact.model = input.role.model;
	if (structuredResult !== undefined) artifact.structuredResult = structuredResult;
	return { artifact, metrics: stageMetrics, result };
}

function buildPromptInput(
	plan: RunPlan,
	role: TriumvirateRolePlan,
	cwd: string,
	text: string,
	cwdKind: TriumvirateCwdKind,
): PromptInput {
	const input: PromptInput = {
		cwd,
		reasoningEffort: plan.reasoningEffort,
		simulation: plan.simulation,
		text,
	};
	if (cwdKind === 'planning_mirror') input.heuristicMode = 'planning';
	if (role.model !== undefined) input.model = role.model;
	if (plan.thinking !== undefined) input.thinking = plan.thinking;
	if (plan.thinkingLevel !== undefined) input.thinkingLevel = plan.thinkingLevel;
	return input;
}

function assistantText(events: AgentEvent[]): string {
	return events
		.filter((event) => event.type === 'assistant_text')
		.map((event) => (event.type === 'assistant_text' ? event.chunk : ''))
		.join('\n');
}

export function mergeMetrics(target: IterationMetrics, next: IterationMetrics): void {
	target.toolCallCount += next.toolCallCount;
	target.cachedTokens += next.cachedTokens;
	target.inputTokens += next.inputTokens;
	target.outputTokens += next.outputTokens;
	target.reasoningTokens += next.reasoningTokens;
	target.costUsd += next.costUsd;
	target.errorCount += next.errorCount;
	target.idleWarningCount += next.idleWarningCount;
	target.rateLimitCount += next.rateLimitCount;
	target.filesEditedCount += next.filesEditedCount;
	target.filesCreatedCount += next.filesCreatedCount;
	target.errorReasons.push(...next.errorReasons);
	for (const [tool, count] of Object.entries(next.toolBreakdown)) {
		target.toolBreakdown[tool] = (target.toolBreakdown[tool] ?? 0) + count;
	}
}

export function stageTranscript(stage: string, result: StageRunResult): string {
	return `# triumvirate:${stage}\n${result.result.transcript}`;
}
