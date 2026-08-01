import type { IterationMetrics } from 'aidd-shared/orchestrator/result';

import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { runRepoDir } from 'aidd-shared/plan/types';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { TriumvirateRunOptions, TriumvirateRunResult } from './triumvirate/types.ts';

import { runComplexityFastPath } from './triumvirate/complexity-fast-path.ts';
import { finalizeTriumvirateExecution } from './triumvirate/execution-stage.ts';
import { buildTriumvirateMetadata } from './triumvirate/metadata.ts';
import {
	failedStageResult,
	guardedResult,
	planningMirrorMutationResult,
	planOrInvalidResult,
	triumvirateDeadlinePassed,
	wallClockExceededResult,
} from './triumvirate/run-result.ts';
import {
	assertUnchanged,
	createMirrorCopyFilter,
	createPlanningMirrors,
	rewritePromptProjectPathForPlanningMirror,
	runPlanningStageWithMirrorGuard,
	snapshotWorktree,
} from './triumvirate/scratch-workspace.ts';
import { mergeMetrics, runStageWithOptions } from './triumvirate/stage-execution.ts';
import {
	buildOverseerPrompt,
	buildPlannerPrompt,
	planValidationReason,
} from './triumvirate/stage-prompts.ts';
import { emptyMetrics } from './triumvirate/types.ts';

export type {
	BackendFactory,
	TriumvirateRunOptions,
	TriumvirateRunResult,
} from './triumvirate/types.ts';

export async function runTriumvirateIteration(
	options: TriumvirateRunOptions,
): Promise<TriumvirateRunResult> {
	if (!options.plan.triumvirate) {
		return {
			artifact: { triumvirate: { error: 'missing_triumvirate_plan' } },
			metrics: emptyMetrics,
			status: 'invalid',
			summary: 'triumvirate plan missing',
		};
	}

	const scratchRoot = await mkdtemp(join(tmpdir(), 'aidd-triumvirate-'));
	const scratchSourceDir = join(scratchRoot, 'source');
	const planningProjectDirs = {
		overseer: join(scratchRoot, 'overseer'),
		primary: join(scratchRoot, 'primary'),
		secondary: join(scratchRoot, 'secondary'),
	} as const;
	try {
		await cp(runRepoDir(options.plan), scratchSourceDir, {
			dereference: false,
			filter: createMirrorCopyFilter(runRepoDir(options.plan)),
			recursive: true,
		});
		await createPlanningMirrors(scratchRoot, scratchSourceDir, planningProjectDirs);
		const baseline = await snapshotWorktree(runRepoDir(options.plan));
		const roles = options.plan.triumvirate;
		const primaryPlanningPrompt = rewritePromptProjectPathForPlanningMirror(
			options.compiledPrompt,
			runRepoDir(options.plan),
			planningProjectDirs.primary,
		);
		const secondaryPlanningPrompt = rewritePromptProjectPathForPlanningMirror(
			options.compiledPrompt,
			runRepoDir(options.plan),
			planningProjectDirs.secondary,
		);
		const overseerPlanningPrompt = rewritePromptProjectPathForPlanningMirror(
			options.compiledPrompt,
			runRepoDir(options.plan),
			planningProjectDirs.overseer,
		);
		const metadata = buildTriumvirateMetadata(options.plan, options.work, planningProjectDirs);
		const metrics: IterationMetrics = { ...emptyMetrics, errorReasons: [], toolBreakdown: {} };

		const primaryRun = await runPlanningStageWithMirrorGuard({
			makeStageRun: (prompt) =>
				runStageWithOptions(options, {
					cwd: planningProjectDirs.primary,
					cwdKind: 'planning_mirror',
					prompt,
					role: roles.primary,
					stage: 'primary',
				}),
			projectDir: planningProjectDirs.primary,
			prompt: buildPlannerPrompt(
				'primary',
				primaryPlanningPrompt,
				options.work,
				planningProjectDirs.primary,
			),
			scratchRoot,
			sourceProjectDir: scratchSourceDir,
			stage: 'primary',
			validate: planValidationReason,
		});
		const primary = primaryRun.result;
		mergeMetrics(metrics, primaryRun.metrics);
		if (primaryRun.violation) {
			return planningMirrorMutationResult('primary', primaryRun, metrics, {
				metadata,
				primaryPlan: primary.artifact,
			});
		}
		if (primary.result.exitCode !== orchestratorExitCodes.success) {
			return failedStageResult('primary', primary, metrics, {
				metadata,
				primaryPlan: primary.artifact,
			});
		}
		const primaryGuard = await assertUnchanged('primary', baseline, runRepoDir(options.plan));
		if (primaryGuard) {
			return guardedResult(primaryGuard, metrics, {
				metadata,
				primaryPlan: primary.artifact,
			});
		}
		// The planning marker is contractual: a planner that exited 0 without a usable
		// planMarkdown (after the guard's one marker retry) is an invalid stage, classified
		// like a single-agent missing AIDD_RESULT — never a prose fallback.
		const primaryPlan = planOrInvalidResult('primary', primary, metrics, {
			metadata,
			primaryPlan: primary.artifact,
		});
		if ('failure' in primaryPlan) return primaryPlan.failure;

		// Complexity fast path (conservative tiering): low-complexity work skips the secondary
		// planner + overseer and executes the primary plan directly. Returns undefined for
		// medium/high, which fall through to the full panel below.
		const fastPath = await runComplexityFastPath(
			options,
			primary,
			primaryPlan.plan,
			metadata,
			metrics,
		);
		if (fastPath) return fastPath;

		if (triumvirateDeadlinePassed(options)) {
			return wallClockExceededResult('secondary', metrics, {
				metadata,
				primaryPlan: primary.artifact,
			});
		}
		const secondaryRun = await runPlanningStageWithMirrorGuard({
			makeStageRun: (prompt) =>
				runStageWithOptions(options, {
					cwd: planningProjectDirs.secondary,
					cwdKind: 'planning_mirror',
					prompt,
					role: roles.secondary,
					stage: 'secondary',
				}),
			projectDir: planningProjectDirs.secondary,
			prompt: buildPlannerPrompt(
				'secondary',
				secondaryPlanningPrompt,
				options.work,
				planningProjectDirs.secondary,
			),
			scratchRoot,
			sourceProjectDir: scratchSourceDir,
			stage: 'secondary',
			validate: planValidationReason,
		});
		const secondary = secondaryRun.result;
		mergeMetrics(metrics, secondaryRun.metrics);
		if (secondaryRun.violation) {
			return planningMirrorMutationResult('secondary', secondaryRun, metrics, {
				metadata,
				primaryPlan: primary.artifact,
				secondaryPlan: secondary.artifact,
			});
		}
		if (secondary.result.exitCode !== orchestratorExitCodes.success) {
			return failedStageResult('secondary', secondary, metrics, {
				metadata,
				primaryPlan: primary.artifact,
				secondaryPlan: secondary.artifact,
			});
		}
		const secondaryGuard = await assertUnchanged(
			'secondary',
			baseline,
			runRepoDir(options.plan),
		);
		if (secondaryGuard) {
			return guardedResult(secondaryGuard, metrics, {
				metadata,
				primaryPlan: primary.artifact,
				secondaryPlan: secondary.artifact,
			});
		}
		const secondaryPlan = planOrInvalidResult('secondary', secondary, metrics, {
			metadata,
			primaryPlan: primary.artifact,
			secondaryPlan: secondary.artifact,
		});
		if ('failure' in secondaryPlan) return secondaryPlan.failure;

		if (triumvirateDeadlinePassed(options)) {
			return wallClockExceededResult('overseer', metrics, {
				metadata,
				primaryPlan: primary.artifact,
				secondaryPlan: secondary.artifact,
			});
		}
		const overseerRun = await runPlanningStageWithMirrorGuard({
			makeStageRun: (prompt) =>
				runStageWithOptions(options, {
					cwd: planningProjectDirs.overseer,
					cwdKind: 'planning_mirror',
					prompt,
					role: roles.overseer,
					stage: 'overseer',
				}),
			projectDir: planningProjectDirs.overseer,
			prompt: buildOverseerPrompt(
				overseerPlanningPrompt,
				primaryPlan.plan,
				secondaryPlan.plan,
				planningProjectDirs.overseer,
				options.plan.consistencyGate ?? false,
			),
			scratchRoot,
			sourceProjectDir: scratchSourceDir,
			stage: 'overseer',
		});
		const overseer = overseerRun.result;
		mergeMetrics(metrics, overseerRun.metrics);
		if (overseerRun.violation) {
			return planningMirrorMutationResult('overseer', overseerRun, metrics, {
				metadata,
				overseerDecision: overseer.artifact,
				primaryPlan: primary.artifact,
				secondaryPlan: secondary.artifact,
			});
		}
		if (overseer.result.exitCode !== orchestratorExitCodes.success) {
			return failedStageResult('overseer', overseer, metrics, {
				metadata,
				overseerDecision: overseer.artifact,
				primaryPlan: primary.artifact,
				secondaryPlan: secondary.artifact,
			});
		}
		const overseerGuard = await assertUnchanged('overseer', baseline, runRepoDir(options.plan));
		if (overseerGuard) {
			return guardedResult(overseerGuard, metrics, {
				metadata,
				overseerDecision: overseer.artifact,
				primaryPlan: primary.artifact,
				secondaryPlan: secondary.artifact,
			});
		}

		if (triumvirateDeadlinePassed(options)) {
			return wallClockExceededResult('execution', metrics, {
				metadata,
				overseerDecision: overseer.artifact,
				primaryPlan: primary.artifact,
				secondaryPlan: secondary.artifact,
			});
		}
		return await finalizeTriumvirateExecution({
			executionRole: roles.execution,
			metadata,
			metrics,
			options,
			overseer,
			primary,
			secondary,
		});
	} finally {
		await rm(scratchRoot, { force: true, recursive: true });
	}
}
