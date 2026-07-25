import type { IterationMetrics } from 'aidd-shared/orchestrator/result';
import type { TriumvirateRolePlan } from 'aidd-shared/plan/types';

import { runRepoDir } from 'aidd-shared/plan/types';

import type { StageRunResult, TriumvirateRunOptions, TriumvirateRunResult } from './types.ts';

import { buildDecisionArtifact, parseOverseerDecision } from './overseer-decision.ts';
import { mergeMetrics, runStageWithOptions, stageTranscript } from './stage-execution.ts';
import { buildExecutionPrompt } from './stage-prompts.ts';

interface FinalizeExecutionParams {
	executionRole: TriumvirateRolePlan;
	metadata: Record<string, unknown>;
	metrics: IterationMetrics;
	options: TriumvirateRunOptions;
	overseer: StageRunResult;
	primary: StageRunResult;
	secondary: StageRunResult;
}

// Parse the overseer's decision and, when it says execute, run the execution stage against the real
// project worktree. Aborted/invalid decisions short-circuit into the matching TriumvirateRunResult;
// keeping execution here leaves the orchestrator entrypoint focused on the planning panel.
export async function finalizeTriumvirateExecution(
	params: FinalizeExecutionParams,
): Promise<TriumvirateRunResult> {
	const { executionRole, metadata, metrics, options, overseer, primary, secondary } = params;

	const decision = parseOverseerDecision(overseer.result.structuredResult);
	const baseArtifact = {
		decision: buildDecisionArtifact(decision, overseer.result.structuredResult),
		metadata,
		overseerDecision: overseer.artifact,
		primaryPlan: primary.artifact,
		secondaryPlan: secondary.artifact,
	};
	if (decision.status === 'abort') {
		return {
			artifact: { triumvirate: { ...baseArtifact, aborted: decision.reason } },
			metrics,
			status: 'aborted',
			summary: `triumvirate overseer aborted execution: ${decision.reason}`,
		};
	}
	if (decision.status === 'invalid') {
		return {
			artifact: { triumvirate: { ...baseArtifact, invalidDecision: decision.reason } },
			metrics,
			status: 'invalid',
			summary: `triumvirate overseer decision invalid: ${decision.reason}`,
		};
	}

	const execution = await runStageWithOptions(options, {
		cwd: runRepoDir(options.plan),
		cwdKind: 'project',
		prompt: buildExecutionPrompt(
			options.compiledPrompt,
			decision.finalActions,
			decision.consistencyIssues ?? [],
		),
		role: executionRole,
		stage: 'execution',
	});
	mergeMetrics(metrics, execution.metrics);
	execution.result.transcript = [
		stageTranscript('primary', primary),
		stageTranscript('secondary', secondary),
		stageTranscript('overseer', overseer),
		stageTranscript('execution', execution),
	].join('\n');

	return {
		artifact: {
			triumvirate: {
				...baseArtifact,
				execution: execution.artifact,
				finalActions: decision.finalActions,
				...(decision.consistencyIssues?.length
					? { consistencyIssues: decision.consistencyIssues }
					: {}),
			},
		},
		metrics,
		result: execution.result,
		status: 'executed',
	};
}
