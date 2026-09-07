import type { ProjectFeature } from '../../../api/types.ts';

export const UNASSIGNED_PRIORITY = '__unassigned_priority';

function featurePriorityValue(feature: ProjectFeature): string {
	return typeof feature.priority === 'number' ? String(feature.priority) : UNASSIGNED_PRIORITY;
}

export function featureMatchesPriorityFilter(
	feature: ProjectFeature,
	priorityFilter: string | undefined,
): boolean {
	return (
		!priorityFilter ||
		priorityFilter === 'all' ||
		featurePriorityValue(feature) === priorityFilter
	);
}

export function priorityFilterOptions(
	features: ProjectFeature[],
): { label: string; value: string }[] {
	const priorities = new Set<number>();
	let hasUnassigned = false;
	for (const feature of features) {
		if (typeof feature.priority === 'number') priorities.add(feature.priority);
		else hasUnassigned = true;
	}
	const options = [...priorities]
		.sort((left, right) => left - right)
		.map((priority) => ({ label: `P${priority}`, value: String(priority) }));
	if (hasUnassigned) options.push({ label: 'Unassigned', value: UNASSIGNED_PRIORITY });
	return options;
}
