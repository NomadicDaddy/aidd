import type { TelemetryResourceType } from '../../api/types.ts';

export interface TelemetryResourceAvailability {
	recipeIds: ReadonlySet<string>;
	skillIds: ReadonlySet<string>;
}

export const emptyTelemetryResourceAvailability: TelemetryResourceAvailability = {
	recipeIds: new Set(),
	skillIds: new Set(),
};

export function telemetryResourceLink(
	type: TelemetryResourceType,
	id: string,
	availableResources: TelemetryResourceAvailability,
): string | undefined {
	if (id.length === 0) return undefined;
	const encodedId = encodeURIComponent(id);
	if (type === 'recipe') {
		return availableResources.recipeIds.has(id) ? `/recipes/${encodedId}` : undefined;
	}
	if (type === 'run') return `/runs?run=${encodedId}`;
	return availableResources.skillIds.has(id) ? `/skills?q=${encodedId}` : undefined;
}
