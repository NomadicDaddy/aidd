import type { ModeContext, ModeHandler, ModeResult, SelectedWork } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import { readPersistedBlueprintReadiness } from 'aidd-shared/metadata/blueprint';
import { selectNextFeature } from 'aidd-shared/metadata/features';

import { createPlanBackedMode } from './base.ts';
import { evaluateFeatureCompletion } from './coding/completion.ts';
import {
	type RoadmapScopedQuery,
	featureQuery,
	featureTargetBlockedByRoadmap,
	featureWorkBreakdown,
	explicitFeatureTarget,
	invalidRoadmapNoWork,
	milestoneTargetBlockedByRoadmap,
	noWorkDescription,
	noWorkSummary,
	roadmapGateDetail,
	roadmapNoWork,
	roadmapScopedQuery,
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

export function advanceBlueprintRunToCoding(plan: RunPlan): void {
	plan.prompt.phase = 'coding';
	plan.prompt.fragments = plan.prompt.fragments.map((fragment) =>
		fragment.kind === 'phase'
			? { id: 'coding', kind: 'phase', path: 'prompts/coding.md' }
			: fragment
	);
}

export function createCodingMode(plan: RunPlan): ModeHandler {
	const base = createPlanBackedMode(plan);
	return {
		...base,
		async buildPromptPlan(_context: ModeContext, work: SelectedWork) {
			return {
				...plan.prompt,
				variables: {
					...plan.prompt.variables,
					selectedFeatureId: work.kind === 'feature' ? work.id : undefined,
				},
			};
		},
		name: 'coding',
		async processResult(context, result): Promise<ModeResult> {
			if (plan.prompt.phase === 'initializer' || plan.prompt.phase === 'onboarding') {
				const completedPhase = plan.prompt.phase;
				const { detectInitialPhase } = await import('aidd-shared/metadata/onboarding');
				const detected = await detectInitialPhase(plan.projectDir);

				// Existing-code onboarding is complete at coding-ready; only from-idea initialization
				// requires the persisted-blueprint gate before it can stop or enter implementation.
				if (completedPhase === 'onboarding') {
					const advanced = detected === 'coding';
					return {
						artifacts: { detectedAfter: detected, phase: completedPhase },
						complete: advanced || result.skipped === true,
						summary: advanced
							? `${completedPhase} phase complete; project is ready for coding`
							: `${completedPhase} phase iteration finished with exit code ${result.exitCode}; phase still '${detected}'`,
					};
				}

				const readiness = await readPersistedBlueprintReadiness(plan.projectDir);
				const advanced = detected === 'coding' && readiness.ready;
				if (advanced && !plan.stopBeforeImplementation) {
					advanceBlueprintRunToCoding(plan);
				}
				return {
					artifacts: {
						detectedAfter: detected,
						phase: completedPhase,
						readinessReason: readiness.reason,
						stopBeforeImplementation: plan.stopBeforeImplementation,
					},
					complete:
						(advanced && plan.stopBeforeImplementation) || result.skipped === true,
					summary: advanced
						? plan.stopBeforeImplementation
							? `${completedPhase} phase complete; persisted blueprint is ready for implementation`
							: `${completedPhase} phase complete; continuing with feature implementation`
						: `${completedPhase} phase iteration finished with exit code ${result.exitCode}; ${readiness.reason ?? `phase still '${detected}'`}`,
				};
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
				scoped.query.includeAudit === true
			);
			const resultArtifacts = {
				completedFeature: shouldComplete ? selectedFeatureId : null,
				eligibleFeatures: breakdown.eligible,
				remainingDependencyBlockedFeatures: breakdown.dependencyBlocked,
				remainingFeatures: breakdown.remaining,
				remainingPendingApproval: breakdown.pendingApproval,
				...(completionOutcome ? { completionOutcome } : {}),
				...(completionMarkerIgnored ? { completionMarkerIgnored } : {}),
				...(verificationBlockedParked && selectedFeatureId !== undefined
					? { verificationBlockedParked: selectedFeatureId }
					: {}),
			};
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
							? `coding parked ${selectedFeatureId} as waiting_approval (live verification blocked); ${noWork}`
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
						? `coding completion marker ignored: ${completionMarkerIgnored}; ${breakdown.remaining} incomplete feature(s) remain`
						: verificationBlockedParked
							? `coding parked ${selectedFeatureId} as waiting_approval (live verification blocked); ${breakdown.remaining} incomplete feature(s) remain`
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
				scoped.gate
			);
			if (roadmapTargetBlock) return roadmapTargetBlock;
			const features = await context.store.listFeatures(scoped.query);
			const breakdown = featureWorkBreakdown(
				features,
				allFeatures,
				scoped.query.includeAudit === true
			);
			const selected = selectNextFeature(
				features,
				scoped.query.includeAudit ? { allFeatures, includeAudit: true } : { allFeatures }
			);
			if (!selected) {
				return {
					data: {
						dependencyBlocked: breakdown.dependencyBlocked,
						eligible: breakdown.eligible,
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
