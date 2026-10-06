import type { FleetSummary } from '../../api/types.ts';

export const MAX_QUEUE_ITEMS = 6;

export interface FeatureQueueItem {
	featureId: string;
	priority: null | number;
	projectId: string | undefined;
	projectName: string;
	title: string;
}

/**
 * Flattens each fleet project's open feature backlog (`backlog.feature.top`) into a single
 * fleet-wide queue ordered by numeric priority (lowest number first), then by project name.
 * `projectIdByName` resolves a fleet `slug` (the project basename) to its route id so each row
 * can deep-link to that project's features tab.
 */
export function buildFeatureQueue(
	fleet: FleetSummary | undefined,
	projectIdByName: Map<string, string>,
): FeatureQueueItem[] {
	return (fleet?.projects ?? [])
		.flatMap((project) =>
			project.backlog.feature.top.map((item) => ({
				featureId: item.id,
				priority: item.priority,
				projectId: projectIdByName.get(project.slug),
				projectName: project.slug,
				title: item.title,
			})),
		)
		.sort((left, right) => {
			const leftPriority = left.priority ?? Number.MAX_SAFE_INTEGER;
			const rightPriority = right.priority ?? Number.MAX_SAFE_INTEGER;
			if (leftPriority !== rightPriority) return leftPriority - rightPriority;
			return left.projectName.localeCompare(right.projectName);
		})
		.slice(0, MAX_QUEUE_ITEMS);
}
