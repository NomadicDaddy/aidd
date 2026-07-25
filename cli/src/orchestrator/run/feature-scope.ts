import type { AgentEvent } from 'aidd-shared/backends/types';
import type { AiddStore } from 'aidd-shared/metadata/store';
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
	const snapshot: FeatureCompletionSnapshot = new Map();
	const features = await store.listFeatures({ includeAudit: true });
	for (const feature of features) {
		snapshot.set(
			feature.directory ?? feature.id,
			feature.status === 'completed' && feature.passes === true,
		);
	}
	return snapshot;
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
	const completed = [...after.entries()]
		.filter(([featureId, isComplete]) => isComplete && before.get(featureId) !== true)
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
		scopeOverrun: extraCompletedFeatures.length > 0,
		selectedFeatures: selected,
		unacceptedCompletedFeatures: uniqueOrdered(unacceptedCompletedFeatures),
	};
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
