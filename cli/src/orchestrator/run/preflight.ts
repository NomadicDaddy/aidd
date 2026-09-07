import type { AiddStore } from 'aidd-shared/metadata/store';
import type { SelectedWork } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import {
	type AgentRunResult,
	orchestratorExitCodes,
	type StopReason,
} from 'aidd-shared/orchestrator/result';
import { runRepoDir } from 'aidd-shared/plan/types';
import { setTimeout as sleep } from 'node:timers/promises';

import { type createModeHandler } from '../../modes/factory.ts';
import { writeRunSummary } from './artifacts.ts';
import { claimSelectedFeatureForIteration } from './feature-scope.ts';
import { gitDirtyFileCount } from './git.ts';
import { endRunIfClaimsKeepVanishing } from './run-ending.ts';
import {
	type MoveFn,
	type OrchestratorDeps,
	type RunAccumulator,
	runRuntimeFields,
} from './types.ts';

export async function handleDirtyTreeSkip(
	deps: OrchestratorDeps,
	plan: RunPlan,
	acc: RunAccumulator,
	iteration: number,
	move: MoveFn,
): Promise<number | undefined> {
	// Exclude aidd-owned .aidd/ metadata from the gate: it is write-allowlisted separately
	// and intake's own metadata writes must not block the audit steps intake runs next.
	const dirtyFileCount = await gitDirtyFileCount(runRepoDir(plan), { excludeAiddMetadata: true });
	if (dirtyFileCount <= plan.dirtyTreeThreshold) return undefined;
	const blockedAt = new Date().toISOString();
	const summaryText = `Dirty working tree (${dirtyFileCount} files) exceeds threshold (${plan.dirtyTreeThreshold}); skipping run.`;
	console.warn(`[orchestrator] ${summaryText}`);
	const structured = {
		durationMs: 0,
		endedAt: blockedAt,
		iteration,
		runId: acc.runId,
		selectedWork: { kind: 'none' as const, reason: 'dirty_tree_too_high' as const },
		startedAt: blockedAt,
		summary: summaryText,
		...runRuntimeFields(plan),
		blockReason: 'dirty_tree_too_high' as const,
		dirtyFileCount,
		dirtyTreeThreshold: plan.dirtyTreeThreshold,
	};
	await deps.store.writeIteration({ log: '', structured });
	await deps.observer?.onIteration?.({ log: '', structured });
	move({ summary: summaryText, type: 'complete' });
	await writeRunSummary(deps, plan, acc, 'blocked', orchestratorExitCodes.success, summaryText);
	return orchestratorExitCodes.success;
}

/** Apply the project-tree gate only to modes whose work is rooted in that project. */
export async function handleModeDirtyTreeSkip(
	deps: OrchestratorDeps,
	plan: RunPlan,
	acc: RunAccumulator,
	iteration: number,
	move: MoveFn,
): Promise<number | undefined> {
	// Director is fleet-wide and reads from its neutral data/director cwd, so foreign project Git
	// state cannot meaningfully gate it. Every project-rooted mode retains the normal protection.
	if (plan.mode === 'director') return undefined;
	return await handleDirtyTreeSkip(deps, plan, acc, iteration, move);
}

export async function handleNoWorkIteration(input: {
	acc: RunAccumulator;
	context: {
		projectDir: string;
		rootDir: string;
		scoringRoots?: readonly string[];
		store: AiddStore;
	};
	deps: OrchestratorDeps;
	iteration: number;
	mode: ReturnType<typeof createModeHandler>;
	move: MoveFn;
	plan: RunPlan;
	work: SelectedWork;
}): Promise<number> {
	const { acc, context, deps, iteration, mode, move, plan, work } = input;
	const result: AgentRunResult = {
		events: [],
		exitCode: orchestratorExitCodes.success,
		filesModified: [],
		selectedWork: work,
		skipped: true,
		transcript: '',
	};
	move({ result, type: 'process_result' });
	const modeResult = await mode.processResult(context, result);
	await deps.observer?.onModeResult?.(modeResult);
	move({ result, type: 'write_artifacts' });
	const noWorkAt = new Date().toISOString();
	const structured = {
		durationMs: 0,
		endedAt: noWorkAt,
		iteration,
		runId: acc.runId,
		selectedWork: work,
		startedAt: noWorkAt,
		summary: modeResult.summary,
		...runRuntimeFields(plan),
		...modeResult.artifacts,
	};
	await deps.store.writeIteration({
		log: '',
		structured,
	});
	await deps.observer?.onIteration?.({ log: '', structured });
	const summary = await mode.summarize(context, modeResult);
	console.log(summary.text);
	move({ summary: summary.text, type: 'complete' });
	await writeRunSummary(
		deps,
		plan,
		acc,
		noWorkStopReason(work),
		orchestratorExitCodes.success,
		summary.text,
	);
	if (plan.noWorkBackoffMs > 0) {
		await sleep(plan.noWorkBackoffMs);
	}
	return orchestratorExitCodes.success;
}

// A roadmap-gate block is a configuration problem the operator must fix, not an empty
// backlog; reporting it as no_work rendered it as a neutral grey "No work" badge and the
// block went unnoticed. 'blocked' maps to the existing red "Blocked: gate" treatment.
// Exit code stays success: nothing crashed, and launchers must not retry-storm it.
// Exported for unit tests.
export function noWorkStopReason(work: SelectedWork): StopReason {
	const data = work.data as
		| {
				leaseHolderRunId?: unknown;
				requestedFeature?: unknown;
				requestedMilestone?: unknown;
				roadmapGate?: unknown;
		  }
		| undefined;
	if (data === undefined) return 'no_work';
	// An explicit feature launch refused because another live run holds the feature's lease is
	// a per-feature refusal the operator should see, not an empty backlog. Untargeted selection
	// that merely found every candidate leased stays plain no_work — the loser of a lease race
	// exhausting the queue is normal concurrent operation.
	if (data.leaseHolderRunId !== undefined && data.requestedFeature !== undefined) {
		return 'blocked';
	}
	const gate = data.roadmapGate as { blocked?: unknown } | undefined;
	if (gate?.blocked === true) return 'blocked';
	// Feature/milestone targets outside the active milestone carry a non-blocked gate plus the
	// rejected target — those are gate refusals too, not an empty backlog.
	if (
		gate !== undefined &&
		(data.requestedFeature !== undefined || data.requestedMilestone !== undefined)
	) {
		return 'blocked';
	}
	return 'no_work';
}

export type IterationSelection =
	| { consecutiveVanishedClaims: number; kind: 'reselect' }
	| { consecutiveVanishedClaims: number; kind: 'work'; work: SelectedWork }
	| { exitCode: number; kind: 'return' };

/** Loop-top work selection and its claim. A selected feature's record can be deleted between the
 * two by a concurrent run (a consolidation directive, an operator prune); when that happens the
 * caller must reselect rather than dispatch a backend at a feature directory that no longer holds a
 * spec, and the skipped pass must not count against maxIterations — hence the streak returned here
 * rather than an iteration bump. */
export async function selectAndClaimIterationWork(input: {
	acc: RunAccumulator;
	consecutiveVanishedClaims: number;
	context: {
		projectDir: string;
		rootDir: string;
		scoringRoots?: readonly string[];
		store: AiddStore;
	};
	deps: OrchestratorDeps;
	mode: ReturnType<typeof createModeHandler>;
	move: MoveFn;
	plan: RunPlan;
}): Promise<IterationSelection> {
	const { acc, context, deps, mode, move, plan } = input;
	move({ plan, type: 'select_work' });
	const work = await mode.selectWork(context);
	const claim = await claimSelectedFeatureForIteration(deps.store, work);
	// Attribution survives a vanished record: the run did select it, and the ledger should say so.
	if (claim.featureId !== undefined) acc.selectedFeatures.add(claim.featureId);
	if (!claim.vanished) return { consecutiveVanishedClaims: 0, kind: 'work', work };
	const consecutiveVanishedClaims = input.consecutiveVanishedClaims + 1;
	const exitCode = await endRunIfClaimsKeepVanishing({
		acc,
		consecutiveVanishedClaims,
		deps,
		featureId: claim.featureId,
		move,
		plan,
	});
	if (exitCode !== undefined) return { exitCode, kind: 'return' };
	return { consecutiveVanishedClaims, kind: 'reselect' };
}
