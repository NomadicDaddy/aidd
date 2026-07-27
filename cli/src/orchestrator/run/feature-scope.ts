import type { AgentEvent } from 'aidd-shared/backends/types';
import type { AiddStore, FeatureReadFailure } from 'aidd-shared/metadata/store';
import type { SelectedWork } from 'aidd-shared/modes/types';

import { extractStructuredResult } from 'aidd-shared/orchestrator/result';

import type { FeatureCompletionSnapshot, FeatureScopeAudit } from './types.ts';

import { uniqueOrdered } from '../triumvirate/planning-recovery.ts';

export async function claimSelectedFeatureForIteration(
	store: AiddStore,
	work: SelectedWork,
): Promise<string | undefined> {
	if (work.kind !== 'feature') return undefined;
	const feature = await store.readFeature(work.id);
	if (feature.status === 'completed' && feature.passes === true) return work.id;
	if (feature.status === 'in_progress') return work.id;
	// A parked feature is waiting on a human decision, so claiming it must never silently un-park it
	// — that would erase the decision and orphan the blockingContext the queue renders. Selection
	// already filters waiting_approval (selectNextFeature), so this is unreachable today; it is here
	// so a future selection change cannot quietly turn a park back into open work.
	if (feature.status === 'waiting_approval') return work.id;
	await store.writeFeature({
		...feature,
		passes: false,
		status: 'in_progress',
		updatedAt: new Date().toISOString(),
	});
	return work.id;
}

export async function captureFeatureCompletionSnapshot(
	store: AiddStore,
): Promise<FeatureCompletionSnapshot> {
	const completed = new Map<string, boolean>();
	const features = await store.listFeatures({ includeAudit: true });
	for (const feature of features) {
		completed.set(
			feature.directory ?? feature.id,
			feature.status === 'completed' && feature.passes === true,
		);
	}
	return { completed, unreadable: await store.listFeatureReadFailures() };
}

export async function auditFeatureScope(
	store: AiddStore,
	work: SelectedWork,
	before: FeatureCompletionSnapshot,
	allowedCompletedFeature: string | undefined,
): Promise<FeatureScopeAudit> {
	const allowedFeatureIds = allowedFeatureIdsForWork(work);
	const allowedFeatureIdSet = new Set(allowedFeatureIds);
	const after = await captureFeatureCompletionSnapshot(store);
	// A record that was unreadable when the iteration started is not evidence of anything: it was
	// missing from `before` because it would not parse, not because the feature was incomplete.
	// Repairing it therefore looks identical to completing it, and a run was once killed for
	// "completing" a feature that had been finished four days earlier and corrupted since.
	const unreadableBefore = new Set(before.unreadable.map((failure) => failure.directory));
	const completed = [...after.completed.entries()]
		.filter(
			([featureId, isComplete]) =>
				isComplete &&
				before.completed.get(featureId) !== true &&
				!unreadableBefore.has(featureId),
		)
		.map(([featureId]) => featureId);
	if (allowedCompletedFeature !== undefined && !completed.includes(allowedCompletedFeature)) {
		completed.push(allowedCompletedFeature);
	}
	const completedAllowedFeatures = completed.filter((featureId) =>
		allowedFeatureIdSet.has(featureId),
	);
	const selected =
		work.kind === 'feature'
			? uniqueOrdered([
					...(allowedCompletedFeature !== undefined ? [allowedCompletedFeature] : []),
					...completedAllowedFeatures,
				])
			: [];
	const extraCompletedFeatures =
		work.kind === 'feature'
			? completed.filter((featureId) => !allowedFeatureIdSet.has(featureId))
			: [];
	const unacceptedCompletedFeatures =
		work.kind === 'feature'
			? completedAllowedFeatures.filter((featureId) => featureId !== allowedCompletedFeature)
			: [];
	return {
		allowedFeatureIds,
		completedFeatures: uniqueOrdered(completed),
		completionMarkerIssue:
			unacceptedCompletedFeatures.length > 0
				? 'completion_marker_missing_or_unaccepted'
				: undefined,
		extraCompletedFeatures: uniqueOrdered(extraCompletedFeatures),
		invalidFeatureMetadata: after.unreadable,
		scopeOverrun: extraCompletedFeatures.length > 0,
		selectedFeatures: selected,
		unacceptedCompletedFeatures: uniqueOrdered(unacceptedCompletedFeatures),
	};
}

/** Name the unreadable records in the iteration summary. Without this the only trace of a
 * corrupted feature.json is its absence from a count, which reads as "nothing to do here". */
export function appendInvalidFeatureMetadata(
	summary: string,
	failures: readonly FeatureReadFailure[],
): string {
	if (failures.length === 0) return summary;
	const directories = failures.map((failure) => failure.directory).join(', ');
	return `${summary}; invalid_feature_metadata: unreadable feature.json for ${directories} (invisible to aidd until repaired)`;
}

export function allowedFeatureIdsForWork(work: SelectedWork): string[] {
	return work.kind === 'feature' ? [work.id] : [];
}

export async function acceptedCompletedFeatureFromEvents(
	store: AiddStore,
	events: AgentEvent[],
	work: SelectedWork,
): Promise<string | undefined> {
	const structuredResult = extractStructuredResult(events);
	const featureId =
		typeof structuredResult?.featureId === 'string' ? structuredResult.featureId : undefined;
	if (
		featureId === undefined ||
		structuredResult?.status !== 'completed' ||
		structuredResult?.passes !== true
	) {
		return undefined;
	}
	if (!new Set(allowedFeatureIdsForWork(work)).has(featureId)) return undefined;
	try {
		const feature = await store.readFeature(featureId);
		return feature.status === 'completed' && feature.passes === true ? featureId : undefined;
	} catch {
		return undefined;
	}
}

export function featureRecoveryTarget(work: SelectedWork): string | undefined {
	return work.kind === 'feature' ? work.id : undefined;
}
