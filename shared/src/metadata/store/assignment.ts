import type { Feature } from '../features.ts';

import {
	shippedMilestoneOverride,
	withFeatureMilestone,
} from '../roadmap-milestones/version-mapping.ts';
import {
	type AssignmentMilestoneSelection,
	type Roadmap,
	selectAssignmentMilestone,
} from '../roadmap.ts';

interface FeatureAssignmentDeps {
	listFeatures: () => Promise<Feature[]>;
	persistFeature: (feature: Feature) => Promise<void>;
	readRoadmap: () => Promise<Roadmap>;
	writeRoadmap: (roadmap: Roadmap) => Promise<void>;
}

/** Keep a persisted Feature's roadmap milestone and inherited priority aligned. */
export async function ensureFeatureAssigned(
	feature: Feature,
	deps: FeatureAssignmentDeps,
): Promise<void> {
	let roadmap: Roadmap;
	try {
		roadmap = await deps.readRoadmap();
	} catch {
		return;
	}
	const directory = feature.directory ?? feature.id;
	const existingMilestone = roadmap.features[directory]?.milestone;
	if (existingMilestone && roadmap.milestones[existingMilestone]) {
		// Completed work belongs in the milestone matching the version it shipped in, not wherever
		// intake first filed it. This also repairs direct feature.json edits outside the store.
		const shippedMilestone = shippedMilestoneOverride(roadmap, feature);
		if (shippedMilestone !== null) {
			const updatedRoadmap = withFeatureMilestone(roadmap, directory, shippedMilestone);
			await deps.writeRoadmap(updatedRoadmap);
			await syncFeaturePriority(feature, updatedRoadmap, shippedMilestone, deps);
			return;
		}
		await syncFeaturePriority(feature, roadmap, existingMilestone, deps);
		return;
	}

	const features = await deps.listFeatures();
	const shipped = shippedMilestoneOverride(roadmap, feature);
	const selection: AssignmentMilestoneSelection =
		shipped === null
			? selectAssignmentMilestone(roadmap, features, directory)
			: { milestone: shipped };
	const updatedRoadmap: Roadmap = {
		...withFeatureMilestone(roadmap, directory, selection.milestone),
		milestones: selection.createdMilestone
			? { ...roadmap.milestones, [selection.milestone]: selection.createdMilestone }
			: roadmap.milestones,
	};
	await deps.writeRoadmap(updatedRoadmap);
	await syncFeaturePriority(feature, updatedRoadmap, selection.milestone, deps);
}

async function syncFeaturePriority(
	feature: Feature,
	roadmap: Roadmap,
	milestone: string,
	deps: FeatureAssignmentDeps,
): Promise<void> {
	const priority = roadmap.milestones[milestone]?.priority;
	if (priority === undefined) return;
	if (feature.priority !== undefined && Number(feature.priority) === priority) return;
	await deps.persistFeature({ ...feature, priority });
}
