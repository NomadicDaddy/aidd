import type { AiddStore } from 'aidd-shared/metadata/store';
import type { AgentRunResult } from 'aidd-shared/orchestrator/result';

import { readFeatureIfPresent } from 'aidd-shared/metadata/store/read-optional';
import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';

import {
	detectBlockedVerificationAdmission,
	featureStatusAtSelection,
	parkBlockedVerificationFeature,
	recordVerificationSelfPark,
	trailingAgentExplanation,
} from './verification.ts';

export type CompletionOutcome =
	'completed_after_backend_abort' | 'completed_after_backend_idle' | 'completed';

export interface CompletionEvaluation {
	/** Why a completion claim was rejected, when one was made and not honored. */
	completionMarkerIgnored: string | undefined;
	completionOutcome: CompletionOutcome | undefined;
	selectedFeatureId: string | undefined;
	shouldComplete: boolean;
	/** The selected feature ended the iteration parked as waiting_approval because its live
	 * verification was blocked — either rejected from a false completion claim, or parked by the
	 * agent itself. Either way the iteration produced a correct outcome, not nothing. */
	verificationBlockedParked: boolean;
}

/**
 * Decide what an iteration's AIDD_RESULT marker (or its absence) actually means for the selected
 * feature: an honored completion, a rejected claim, a verification-blocked park, or none of those.
 *
 * The marker is only ever a completion signal — there is no marker shape for parked work — so both
 * park paths are recognized from the agent's prose plus the feature's on-disk state rather than
 * from the marker itself.
 */
export async function evaluateFeatureCompletion(
	store: AiddStore,
	result: AgentRunResult,
): Promise<CompletionEvaluation> {
	const selectedFeatureId =
		result.selectedWork?.kind === 'feature' ? result.selectedWork.id : undefined;
	const structuredFeatureId =
		typeof result.structuredResult?.featureId === 'string'
			? result.structuredResult.featureId
			: undefined;
	const completionMarkerMatches =
		selectedFeatureId !== undefined &&
		structuredFeatureId === selectedFeatureId &&
		result.structuredResult?.status === 'completed' &&
		result.structuredResult?.passes === true;
	const idleAfterCompletion = result.exitCode === orchestratorExitCodes.idleTimeout;
	const abortedAfterCompletion = result.exitCode === orchestratorExitCodes.aborted;
	const reportedCompletion =
		completionMarkerMatches &&
		(result.exitCode === orchestratorExitCodes.success ||
			idleAfterCompletion ||
			abortedAfterCompletion);

	const base: CompletionEvaluation = {
		completionMarkerIgnored: undefined,
		completionOutcome: undefined,
		selectedFeatureId,
		shouldComplete: false,
		verificationBlockedParked: false,
	};

	if (reportedCompletion && selectedFeatureId !== undefined) {
		// "Could not verify" is "not done": a completed/passes:true claim whose own prose admits the
		// feature's live verification was blocked or skipped is rejected and the feature routed to
		// waiting_approval, never counted as a completion.
		const admission = detectBlockedVerificationAdmission(result.events);
		if (admission) {
			const parked = await parkBlockedVerificationFeature(
				store,
				selectedFeatureId,
				admission,
			);
			const blocked = `completion claimed passes:true while live verification was reported blocked or skipped ("${admission.phrase}")`;
			return {
				...base,
				completionMarkerIgnored: parked
					? `${blocked}; feature parked as waiting_approval`
					: `${blocked}; ${vanishedFeatureNote(selectedFeatureId)} so it could not be parked`,
				verificationBlockedParked: parked,
			};
		}
		const feature = await readFeatureIfPresent(store, selectedFeatureId);
		// The record this claim would be checked against is gone, so the claim is unverifiable —
		// not false, but not to be taken on trust either. Ignoring the marker lets the iteration
		// finalize normally (totals, artifacts, ledger) instead of throwing out of finalization.
		if (feature === undefined) {
			return {
				...base,
				completionMarkerIgnored: `${vanishedFeatureNote(selectedFeatureId)}, so the completion claim could not be verified`,
			};
		}
		if (feature.status !== 'completed' || feature.passes !== true) {
			return {
				...base,
				completionMarkerIgnored:
					'selected feature metadata was not updated before AIDD_RESULT',
			};
		}
		return {
			...base,
			completionOutcome: idleAfterCompletion
				? 'completed_after_backend_idle'
				: abortedAfterCompletion
					? 'completed_after_backend_abort'
					: 'completed',
			shouldComplete: true,
		};
	}

	if (
		structuredFeatureId !== undefined &&
		selectedFeatureId !== undefined &&
		structuredFeatureId !== selectedFeatureId
	) {
		return {
			...base,
			completionMarkerIgnored: 'completed feature did not match selected feature',
		};
	}

	if (selectedFeatureId !== undefined) {
		// No completion was claimed. If this iteration moved the selected feature into
		// waiting_approval, the agent invoked the STOP-AND-PARK hatch — a correct outcome, not the
		// "backend produced nothing" case missing_aidd_result exists to catch.
		return {
			...base,
			verificationBlockedParked: await recordVerificationSelfPark(
				store,
				selectedFeatureId,
				featureStatusAtSelection(result.selectedWork),
				trailingAgentExplanation(result.events),
			),
		};
	}

	return base;
}

/** Shared wording for the mid-iteration deletion case: a concurrent run against the same worktree
 * (a consolidation directive, an operator prune) can remove the selected feature's record while
 * this iteration is still running. */
function vanishedFeatureNote(featureId: string): string {
	return `feature record '${featureId}' no longer exists on disk (removed during the iteration)`;
}
