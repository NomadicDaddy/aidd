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
	deps: CreationStatusDeps
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
