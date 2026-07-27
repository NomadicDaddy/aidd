import type { Feature } from 'aidd-shared/metadata/features';
import type { Roadmap } from 'aidd-shared/metadata/roadmap';

import { featureNodeId } from 'aidd-shared/metadata/features';
import { evaluateRoadmapCodingGate, orderedMilestoneNames } from 'aidd-shared/metadata/roadmap';
import { findCrossMilestoneViolations } from 'aidd-shared/metadata/roadmap-milestones';

import type { ProjectMilestonesViewDto } from '../../types/project/milestones.ts';

interface MilestoneTally {
	completed: number;
	directories: string[];
}

// Builds the editable milestone view from a roadmap plus the features on disk. Milestone membership
// lives only in roadmap.json (feature.json has no milestone field), so every count here is derived,
// never read back.
export function buildMilestonesView(
	roadmap: Roadmap,
	features: Feature[],
): ProjectMilestonesViewDto {
	const gate = evaluateRoadmapCodingGate(roadmap, features);
	const order = orderedMilestoneNames(roadmap);
	const tallies = new Map<string, MilestoneTally>(
		order.map((name) => [name, { completed: 0, directories: [] }]),
	);
	for (const feature of features) {
		const node = featureNodeId(feature);
		const milestone = roadmap.features[node]?.milestone;
		const tally = milestone === undefined ? undefined : tallies.get(milestone);
		if (!tally) continue;
		tally.directories.push(node);
		// `passes`, not `status`, so a milestone reads as complete here exactly when the coding
		// gate considers it complete and moves on to the next one.
		if (feature.passes === true) tally.completed += 1;
	}
	return {
		activeMilestone: gate.activeMilestone,
		gateBlocked: gate.blocked,
		lifecycle: roadmap.lifecycle ?? 'active',
		milestones: order.map((name, index) => {
			const tally = tallies.get(name) ?? { completed: 0, directories: [] };
			return {
				completed: tally.completed,
				description: roadmap.milestones[name]?.description ?? null,
				featureDirectories: tally.directories.sort((a, b) => a.localeCompare(b)),
				name,
				priority: roadmap.milestones[name]?.priority ?? index + 1,
				total: tally.directories.length,
			};
		}),
		unmappedFeatureDirectories: gate.unmappedFeatureDirectories,
		violations: findCrossMilestoneViolations(roadmap, features),
	};
}

// True when `next` changes the standing of a milestone that already existed — a rename, a delete, or
// a reorder. Appending at the end leaves the previous order as a prefix and is not a reorder, which
// is why a run in flight can keep going through it: the gate walks the same milestones in the same
// sequence, and the new one is strictly after everything it might reach.
export function reordersExistingMilestones(previous: string[], next: string[]): boolean {
	if (next.length < previous.length) return true;
	return previous.some((name, index) => next[index] !== name);
}
