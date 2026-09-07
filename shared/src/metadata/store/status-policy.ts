import { type Feature, isAuditFinding, isRemediationFeature } from '../features.ts';
import { orderedMilestoneNames, type Roadmap, selectAssignmentMilestone } from '../roadmap.ts';

// Approval-parking policy for brand-new features: roadmap-planned work mapped beyond the
// MVP milestone is born `waiting_approval` instead of `backlog`, so agents cannot pick it
// up before a human approves it. Audit findings and remediation features are exempt —
// they are current-version work created mid-pipeline (audit-and-remediate, bug2feature,
// test-and-remediate) and parking them would leave those pipelines with nothing actionable.
// Roadmaps without an MVP-named milestone (intake/LTS shapes) never park here; existing-app
// intake parks open work via the project-intake recipe's normalization step instead.

export interface CreationStatusDeps {
	featureExists(): Promise<boolean>;
	listFeatures(): Promise<Feature[]>;
	readRoadmap(): Promise<Roadmap>;
}

export async function applyCreationStatusPolicy(
	feature: Feature,
	deps: CreationStatusDeps,
): Promise<Feature> {
	if (feature.status !== 'backlog') return feature;
	if (isAuditFinding(feature) || isRemediationFeature(feature)) return feature;
	if (await deps.featureExists()) return feature;
	let roadmap: Roadmap;
	try {
		roadmap = await deps.readRoadmap();
	} catch {
		return feature;
	}
	const directory = feature.directory ?? feature.id;
	const mapped = roadmap.features[directory]?.milestone;
	const milestone =
		mapped && roadmap.milestones[mapped]
			? mapped
			: selectAssignmentMilestone(roadmap, await deps.listFeatures(), directory).milestone;
	return isMilestoneBeyondMvp(roadmap, milestone)
		? { ...feature, status: 'waiting_approval' }
		: feature;
}

// Beyond-MVP is positional: the milestone sits after the MVP-named milestone (matched
// case-insensitively) in priority order. A milestone selectAssignmentMilestone is about
// to auto-create is always a future bucket, so an unknown name counts as beyond when an
// MVP milestone exists.
export function isMilestoneBeyondMvp(roadmap: Roadmap, milestone: string): boolean {
	const ordered = orderedMilestoneNames(roadmap);
	const mvpIndex = ordered.findIndex((name) => name.toLowerCase() === 'mvp');
	if (mvpIndex === -1) return false;
	const index = ordered.indexOf(milestone);
	return index === -1 || index > mvpIndex;
}

/**
 * Stamp `completedAt` on entry to `completed`, and clear it on reopen.
 *
 * The field is the only record of *when* a feature finished. `updatedAt` is the last metadata write
 * of any kind — measured against the first `Revision <ver> (<date>)` note across this repo's own
 * features it runs a median 15 days late — so it cannot stand in for one.
 *
 * Idempotent: an already-stamped completed feature is returned untouched, so the routine metadata
 * writes that pass through `writeFeature` (milestone edits, priority sync, roadmap assignment) do
 * not keep re-dating a completion. Reopening deletes the stamp rather than leaving a stale instant
 * behind, and re-completing stamps the new one.
 */
export function applyCompletionTimestamp(feature: Feature, now = new Date()): Feature {
	if (feature.status === 'completed') {
		if (typeof feature.completedAt === 'string' && feature.completedAt.length > 0) {
			return feature;
		}
		return { ...feature, completedAt: now.toISOString() };
	}
	// An absent status is not "not completed" — partial writers exist, and status is optional on
	// the schema — so only an explicit non-completed status clears the stamp.
	if (feature.status === undefined || feature.completedAt === undefined) return feature;
	const { completedAt: _completedAt, ...rest } = feature;
	return rest;
}
