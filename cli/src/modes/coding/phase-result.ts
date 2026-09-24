import type { ModeContext, ModeResult } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import { readPersistedBlueprintReadiness } from 'aidd-shared/metadata/blueprint';
import { classifyFeatureStatusType, type Feature } from 'aidd-shared/metadata/features';
import { listMissingOnboardingArtifacts } from 'aidd-shared/metadata/onboarding';
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

/**
 * What the previous setup iteration concluded, so this one can tell a stalled run from a slow one.
 * Owned by the mode (one per run) because the verdict has to survive across iterations.
 */
export interface SetupProgressTracker {
	lastSignature?: string;
}

export function createSetupProgressTracker(): SetupProgressTracker {
	return {};
}

/**
 * Whether this iteration reached the same verdict as the last one, recording it either way.
 *
 * The signature is built from everything the verdict is derived from — the detected phase and
 * either the missing artifacts or the readiness state and reason. An iteration that changed
 * anything readiness reads therefore changes the signature; one that changed nothing repeats it,
 * and a third iteration cannot do better than the second. Only non-advancing paths call this, so
 * real progress never records a signature.
 */
function repeatsPreviousVerdict(
	tracker: SetupProgressTracker | undefined,
	signature: string,
): boolean {
	if (tracker === undefined) return false;
	const repeated = tracker.lastSignature === signature;
	tracker.lastSignature = signature;
	return repeated;
}

/** Result of one initializer/onboarding iteration: advance, stop, or iterate again. */
export async function processPhaseResult(
	plan: RunPlan,
	context: ModeContext,
	result: { exitCode: number; skipped?: boolean },
	tracker?: SetupProgressTracker,
): Promise<ModeResult> {
	const completedPhase = plan.prompt.phase;
	const { detectInitialPhase } = await import('aidd-shared/metadata/onboarding');
	const detected = await detectInitialPhase(plan.projectDir);

	// Existing-code onboarding is complete at coding-ready; only from-idea initialization
	// requires the persisted-blueprint gate before it can stop or enter implementation.
	if (completedPhase === 'onboarding') {
		const advanced = detected === 'coding';
		if (advanced || result.skipped === true) {
			return {
				artifacts: { detectedAfter: detected, phase: completedPhase },
				complete: true,
				summary: advanced
					? `${completedPhase} phase complete; project is ready for coding`
					: `${completedPhase} phase iteration finished with exit code ${result.exitCode}; phase still '${detected}'`,
			};
		}
		const missing = await listMissingOnboardingArtifacts(plan.projectDir);
		if (repeatsPreviousVerdict(tracker, `onboarding|${detected}|${missing.join(',')}`)) {
			return {
				artifacts: {
					detectedAfter: detected,
					missingArtifacts: missing,
					phase: completedPhase,
				},
				complete: true,
				summary: `${completedPhase} produced no change across two iterations; still missing ${missing.join(', ')}`,
			};
		}
		return {
			artifacts: { detectedAfter: detected, phase: completedPhase },
			complete: false,
			summary: `${completedPhase} phase iteration finished with exit code ${result.exitCode}; phase still '${detected}'`,
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

	if (result.skipped === true) {
		return {
			artifacts,
			complete: true,
			summary: `${completedPhase} phase iteration finished with exit code ${result.exitCode}; ${readiness.reason ?? `phase still '${detected}'`}`,
		};
	}

	// Nothing readiness reads moved. Another iteration re-reads the same disk state and reaches the
	// same verdict, so the run would spend every remaining iteration restating it — which is how a
	// missing spec or an unparseable roadmap.json burned to the cap without progressing.
	const signature = `${completedPhase}|${detected}|${readiness.state}|${readiness.reason ?? ''}`;
	if (repeatsPreviousVerdict(tracker, signature)) {
		return {
			artifacts: { ...artifacts, stalled: true },
			complete: true,
			summary: `${completedPhase} produced no change across two iterations; ${readiness.reason ?? `phase still '${detected}'`}`,
		};
	}

	return {
		artifacts,
		complete: false,
		summary: `${completedPhase} phase iteration finished with exit code ${result.exitCode}; ${readiness.reason ?? `phase still '${detected}'`}`,
	};
}
