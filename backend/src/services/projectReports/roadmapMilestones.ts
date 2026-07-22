import type { Feature } from 'aidd-shared/metadata/features';
import type { Roadmap } from 'aidd-shared/metadata/roadmap';
import type { FileAiddStore } from 'aidd-shared/metadata/store';

import type { ProjectReportKind } from '../../types.ts';

export type ReportMilestoneTarget = null | string;

export async function readRoadmapIfUsable(store: FileAiddStore): Promise<null | Roadmap> {
	try {
		const roadmap = await store.readRoadmap();
		return Object.keys(roadmap.milestones).length > 0 ? roadmap : null;
	} catch {
		return null;
	}
}

function currentRoadmapMilestone(roadmap: Roadmap, features: Feature[]): null | string {
	const milestoneNames = Object.keys(roadmap.milestones);
	if (milestoneNames.length === 0) return null;
	for (const milestone of milestoneNames) {
		const milestoneFeatures = features.filter((feature) => {
			const directory = feature.directory ?? feature.id;
			return roadmap.features[directory]?.milestone === milestone;
		});
		if (
			milestoneFeatures.length > 0 &&
			milestoneFeatures.some((feature) => feature.passes !== true)
		) {
			return milestone;
		}
	}
	return milestoneNames[milestoneNames.length - 1] ?? null;
}

export function milestoneForReportFeature(
	roadmap: Roadmap,
	features: Feature[],
	featureKind: ProjectReportKind
): ReportMilestoneTarget {
	const milestoneNames = Object.keys(roadmap.milestones);
	const activeMilestone = currentRoadmapMilestone(roadmap, features);
	if (!activeMilestone) return null;
	if (featureKind === 'bug') return activeMilestone;
	const activeIndex = milestoneNames.indexOf(activeMilestone);
	if (activeIndex >= 0) return milestoneNames[activeIndex + 1] ?? activeMilestone;
	return activeMilestone;
}
