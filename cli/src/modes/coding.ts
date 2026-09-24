import type { FeatureNeighborhood } from 'aidd-shared/metadata/features';
import type { ModeContext, ModeHandler, ModeResult, SelectedWork } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import { buildFeatureNeighborhood, featureNodeId } from 'aidd-shared/metadata/features';
import { parkedWorkMarker } from 'aidd-shared/runs/outcome';

import { createPlanBackedMode } from './base.ts';
import { evaluateFeatureCompletion } from './coding/completion.ts';
import { selectLeasableFeature } from './coding/lease-selection.ts';
import { createSetupProgressTracker, processPhaseResult } from './coding/phase-result.ts';
import {
	explicitFeatureTarget,
	featureQuery,
	featureTargetBlockedByRoadmap,
	featureWorkBreakdown,
	invalidRoadmapNoWork,
	milestoneTargetBlockedByRoadmap,
	noWorkDescription,
	noWorkSummary,
	roadmapGateDetail,
	roadmapNoWork,
	roadmapScopedQuery,
	type RoadmapScopedQuery,
} from './coding/selection.ts';

// When an iteration is skipped because selectWork returned no actionable work, that call has
// already computed a *specific* reason (e.g. the requested feature is outside the active roadmap
// milestone, or every candidate is dependency-blocked / pending approval) and stored it on the
// skipped work's description. Surface it so the runs page and launch toast explain *why* nothing
// ran, instead of collapsing every case to the generic "no incomplete feature work" breakdown
// summary. Returns undefined for a genuinely empty backlog (where the breakdown summary is right).
function skippedNoWorkReason(result: {
	selectedWork?: SelectedWork;
	skipped?: boolean;
}): string | undefined {
	if (result.skipped !== true) return undefined;
	const work = result.selectedWork;
	if (work?.kind !== 'none') return undefined;
	const description = work.description.trim();
	return description.length > 0 ? description : undefined;
}

// Reverse edges are the half the metadata never stored: `dependencies` only records what must land
// first, so nothing told an agent which features are waiting on the surface it is about to build.
// Both directions are derived from the same inventory selection just read. Returns undefined for
// non-feature work (phase prompts, no-work iterations) so the prompt section is simply absent.
async function resolveFeatureGraph(
	context: ModeContext,
	work: SelectedWork,
): Promise<FeatureNeighborhood | undefined> {
	if (work.kind !== 'feature') return undefined;
	const allFeatures = await context.store.listFeatures({ includeAudit: true });
	const selected = allFeatures.find((feature) => featureNodeId(feature) === work.id);
	if (!selected) return undefined;
	return buildFeatureNeighborhood(selected, allFeatures);
}

export function createCodingMode(plan: RunPlan): ModeHandler {
	const base = createPlanBackedMode(plan);
	// One per run: the setup phases stop when two consecutive iterations reach the same verdict,
	// which needs the previous iteration's verdict to compare against.
	const setupProgress = createSetupProgressTracker();
	return {
		...base,
		async buildPromptPlan(context: ModeContext, work: SelectedWork) {
			return {
				...plan.prompt,
				variables: {
					...plan.prompt.variables,
					// Resolved here rather than in the prompt: selection already walked the whole
					// feature inventory to reach this target, so the agent is handed the topology
					// instead of re-deriving it with jq over every feature.json.
					featureGraph: await resolveFeatureGraph(context, work),
					selectedFeatureId: work.kind === 'feature' ? work.id : undefined,
				},
			};
		},
		name: 'coding',
		async processResult(context, result): Promise<ModeResult> {
			if (plan.prompt.phase === 'initializer' || plan.prompt.phase === 'onboarding') {
				return await processPhaseResult(plan, context, result, setupProgress);
			}
			const {
				completionMarkerIgnored,
				completionOutcome,
				selectedFeatureId,
				shouldComplete,
				verificationBlockedParked,
			} = await evaluateFeatureCompletion(context.store, result);

			const allFeatures = await context.store.listFeatures({ includeAudit: true });
			const query = featureQuery(plan);
			let scoped: RoadmapScopedQuery;
			try {
				scoped = await roadmapScopedQuery(context, query, allFeatures);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				return {
					artifacts: {
						roadmapGate: {
							activeMilestone: null,
							allowedFeatureDirectories: [],
							blocked: true,
							blockReason: 'invalid_roadmap',
							errorMessage: message,
						},
					},
					complete: true,
					summary: `coding blocked because roadmap.json is invalid (${message})`,
				};
			}
			if (scoped.gate?.blocked) {
				return {
					artifacts: { roadmapGate: scoped.gate },
					complete: true,
					summary: `coding blocked by roadmap gate: ${scoped.gate.blockReason} — ${roadmapGateDetail(scoped.gate)}`,
				};
			}
			const features = await context.store.listFeatures(scoped.query);
			const breakdown = featureWorkBreakdown(
				features,
				allFeatures,
				scoped.query.includeAudit === true,
			);
			const resultArtifacts = {
				completedFeature: shouldComplete ? selectedFeatureId : null,
				eligibleFeatures: breakdown.eligible,
				incoherentPassingFeatures: breakdown.incoherentPassing,
				remainingDependencyBlockedFeatures: breakdown.dependencyBlocked,
				remainingFeatures: breakdown.remaining,
				remainingPendingApproval: breakdown.pendingApproval,
				...(completionOutcome ? { completionOutcome } : {}),
				...(completionMarkerIgnored ? { completionMarkerIgnored } : {}),
				...(verificationBlockedParked && selectedFeatureId !== undefined
					? { verificationBlockedParked: selectedFeatureId }
					: {}),
			};
			// The run exits 0 with stopReason 'completed' even though the feature it selected is not
			// done, so the summary is the only place the parking survives into the runs table. The
			// prose already says it; classifyWebRun needs a token it can match, or a pipeline
			// session built entirely of parking runs reads fully green.
			const parkedNote =
				verificationBlockedParked && selectedFeatureId !== undefined
					? `; ${parkedWorkMarker} ${selectedFeatureId} was parked, not completed`
					: '';
			if (
				result.skipped ||
				features.length === 0 ||
				breakdown.remaining === 0 ||
				breakdown.eligible === 0
			) {
				const noWork = skippedNoWorkReason(result) ?? noWorkSummary(breakdown);
				return {
					artifacts: resultArtifacts,
					complete: true,
					// Parking the selected feature is what empties the eligible queue, so this
					// branch wins and the bare no-work text would read as "arrived with nothing to
					// do" — hiding that this run did the parking. Lead with what the run did.
					summary:
						verificationBlockedParked && selectedFeatureId !== undefined
							? `coding parked ${selectedFeatureId} as waiting_approval (live verification blocked); ${noWork}${parkedNote}`
							: noWork,
				};
			}
			return {
				artifacts: resultArtifacts,
				complete: false,
				summary: shouldComplete
					? completionOutcome === 'completed_after_backend_idle'
						? `coding completed ${selectedFeatureId} before backend idle; ${breakdown.remaining} incomplete feature(s) remain`
						: completionOutcome === 'completed_after_backend_abort'
							? `coding completed ${selectedFeatureId} before backend abort; ${breakdown.remaining} incomplete feature(s) remain`
							: `coding completed ${selectedFeatureId}; ${breakdown.remaining} incomplete feature(s) remain`
					: completionMarkerIgnored
						? `coding completion marker ignored: ${completionMarkerIgnored}; ${breakdown.remaining} incomplete feature(s) remain${parkedNote}`
						: verificationBlockedParked
							? `coding parked ${selectedFeatureId} as waiting_approval (live verification blocked); ${breakdown.remaining} incomplete feature(s) remain${parkedNote}`
							: `coding finished with exit code ${result.exitCode}; ${breakdown.remaining} incomplete feature(s) remain`,
			};
		},
		async selectWork(context: ModeContext): Promise<SelectedWork> {
			if (plan.prompt.phase === 'initializer' || plan.prompt.phase === 'onboarding') {
				return {
					data: { phase: plan.prompt.phase },
					description: `${plan.prompt.phase} phase prompt`,
					id: plan.prompt.phase,
					kind: 'phase',
				};
			}
			const allFeatures = await context.store.listFeatures({ includeAudit: true });
			const query = featureQuery(plan);
			let scoped: RoadmapScopedQuery;
			try {
				scoped = await roadmapScopedQuery(context, query, allFeatures);
			} catch (err) {
				return invalidRoadmapNoWork(err);
			}
			if (scoped.gate?.blocked) return roadmapNoWork(scoped.gate);
			const roadmapMilestoneBlock = milestoneTargetBlockedByRoadmap(plan, scoped.gate);
			if (roadmapMilestoneBlock) return roadmapMilestoneBlock;
			const roadmapTargetBlock = featureTargetBlockedByRoadmap(
				explicitFeatureTarget(plan),
				allFeatures,
				scoped.gate,
			);
			if (roadmapTargetBlock) return roadmapTargetBlock;
			const features = await context.store.listFeatures(scoped.query);
			const breakdown = featureWorkBreakdown(
				features,
				allFeatures,
				scoped.query.includeAudit === true,
			);
			// Lease-aware selection: concurrent runs against this project (worktree or live-tree)
			// race on exclusive per-feature leases, so the ranked winner here is the first
			// candidate this run actually holds — never a feature another live run is working.
			const selection = await selectLeasableFeature({
				context,
				explicitTarget: explicitFeatureTarget(plan),
				features,
				options: scoped.query.includeAudit
					? { allFeatures, includeAudit: true }
					: { allFeatures },
				totalCandidates: features.length,
			});
			if (selection.leaseBlocked) return selection.leaseBlocked;
			const selected = selection.selected;
			if (!selected) {
				return {
					data: {
						dependencyBlocked: breakdown.dependencyBlocked,
						eligible: breakdown.eligible,
						incoherentPassing: breakdown.incoherentPassing,
						incomplete: breakdown.remaining,
						pendingApproval: breakdown.pendingApproval,
						totalCandidates: features.length,
					},
					description: noWorkDescription(breakdown),
					id: 'no-work',
					kind: 'none',
				};
			}
			return {
				data: selected,
				description: selected.title ?? selected.description ?? selected.id,
				id: selected.directory ?? selected.id,
				kind: 'feature',
			};
		},
	};
}
