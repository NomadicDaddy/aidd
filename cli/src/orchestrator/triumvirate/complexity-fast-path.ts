import type { SelectedWork } from 'aidd-shared/modes/types';
import type { IterationMetrics } from 'aidd-shared/orchestrator/result';

import { classifyComplexity, type ComplexityTier } from 'aidd-shared/orchestrator/complexity';
import { runRepoDir } from 'aidd-shared/plan/types';

import type { StageRunResult, TriumvirateRunOptions, TriumvirateRunResult } from './types.ts';

import { mergeMetrics, runStageWithOptions, stageTranscript } from './stage-execution.ts';
import { buildExecutionPrompt, extractPlan } from './stage-prompts.ts';

// Derive a complexity tier from the selected work. `work.data` carries the feature record for
// feature work; we read its dependency count and combine title + description length. Other work
// kinds fall back to the description length alone.
function selectedWorkTier(work: SelectedWork): ComplexityTier {
	const data = work.data as { dependencies?: unknown; title?: unknown } | undefined;
	const dependencyCount = Array.isArray(data?.dependencies) ? data.dependencies.length : 0;
	const titleLength = typeof data?.title === 'string' ? data.title.length : 0;
	return classifyComplexity({
		dependencyCount,
		textLength: (work.description?.length ?? 0) + titleLength,
	});
}

/**
 * Conservative complexity tiering: when enabled and the selected work is low-complexity, the
 * primary plan goes straight to execution — skipping the secondary planner and the overseer review
 * gate. Returns the executed result, or `undefined` to signal the caller to run the full panel.
 */
export async function runComplexityFastPath(
	options: TriumvirateRunOptions,
	primary: StageRunResult,
	metadata: Record<string, unknown>,
	metrics: IterationMetrics,
): Promise<TriumvirateRunResult | undefined> {
	const roles = options.plan.triumvirate;
	if (!roles) return undefined;
	const tier = options.plan.complexityTiering ? selectedWorkTier(options.work) : 'high';
	if (tier !== 'low') return undefined;

	const finalActions = extractPlan(primary);
	const execution = await runStageWithOptions(options, {
		cwd: runRepoDir(options.plan),
		cwdKind: 'project',
		prompt: buildExecutionPrompt(options.compiledPrompt, finalActions),
		role: roles.execution,
		stage: 'execution',
	});
	mergeMetrics(metrics, execution.metrics);
	execution.result.transcript = [
		stageTranscript('primary', primary),
		stageTranscript('execution', execution),
	].join('\n');
	return {
		artifact: {
			triumvirate: {
				complexityTier: tier,
				execution: execution.artifact,
				finalActions,
				metadata,
				primaryPlan: primary.artifact,
				skippedStages: ['secondary', 'overseer'],
			},
		},
		metrics,
		result: execution.result,
		status: 'executed',
	};
}
