import type { ModeContext, ModeResult } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import { readPersistedBlueprintReadiness } from 'aidd-shared/metadata/blueprint';
import { classifyFeatureStatusType, type Feature } from 'aidd-shared/metadata/features';
import { parkedWorkMarker } from 'aidd-shared/runs/outcome';

export function advanceBlueprintRunToCoding(plan: RunPlan): void {
	plan.prompt.phase = 'coding';
	plan.prompt.fragments = plan.prompt.fragments.map((fragment) =>
		fragment.kind === 'phase'
			? { id: 'coding', kind: 'phase', path: 'prompts/coding.md' }
			: fragment,
	);
}

/**
 * Product features the agent parked on a question only a person can answer. The blocked-state
 * procedure writes `waiting_approval` plus a `blockingContext`; ordinary post-MVP records are also
 * `waiting_approval` but carry no blocking context, so they never match. An approval moves the
 * record back to backlog, so a match is always a question that is still open.
 */
function parkedOnDecision(features: Feature[]): Feature[] {
	return features.filter(
		(feature) =>
			classifyFeatureStatusType(feature) === 'feature' &&
			feature.status === 'waiting_approval' &&
			feature.blockingContext !== undefined,
	);
}

/** Result of one initializer/onboarding iteration: advance, stop, or iterate again. */
export async function processPhaseResult(
	plan: RunPlan,
	context: ModeContext,
	result: { exitCode: number; skipped?: boolean },
): Promise<ModeResult> {
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
	const artifacts = {
		detectedAfter: detected,
		phase: completedPhase,
		readinessReason: readiness.reason,
		stopBeforeImplementation: plan.stopBeforeImplementation,
	};
	if (advanced) {
		return {
			artifacts,
			complete: plan.stopBeforeImplementation === true || result.skipped === true,
			summary: plan.stopBeforeImplementation
				? `${completedPhase} phase complete; persisted blueprint is ready for implementation`
				: `${completedPhase} phase complete; continuing with feature implementation`,
		};
	}

	// The agent cannot answer its own question, so another iteration only re-reads the same open
	// blocker and re-records it. Stop and hand the decision to a person instead of spending every
	// remaining iteration re-confirming the park.
	const parked = parkedOnDecision(await context.store.listFeatures({ includeAudit: true }));
	if (parked.length > 0) {
		const ids = parked.map((feature) => feature.directory ?? feature.id).join(', ');
		const reason = parked[0]?.blockingContext?.reason ?? 'a decision is required';
		return {
			artifacts: { ...artifacts, parkedFeatures: parked.map((feature) => feature.id) },
			complete: true,
			summary: `${completedPhase} parked on a decision (${reason}); ${parkedWorkMarker} ${ids} awaits approval before the blueprint can continue`,
		};
	}

	return {
		artifacts,
		complete: result.skipped === true,
		summary: `${completedPhase} phase iteration finished with exit code ${result.exitCode}; ${readiness.reason ?? `phase still '${detected}'`}`,
	};
}
