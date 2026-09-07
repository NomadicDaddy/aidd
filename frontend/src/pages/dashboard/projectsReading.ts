export interface ProjectsReading {
	count: number;
	split: { failing: number; healthy: number } | null;
}

/**
 * What the Overview Projects tile can honestly say, or null when the dashboard summary failed
 * and it can say nothing.
 *
 * The fleet count is a fair fallback for a summary that returned an empty projects list: the
 * fleet query answers the same question from another source. The healthy / needs-attention
 * split under it never was one. It counted the projects the summary returned, so a failed
 * summary beside a live fleet query subtracted zero failures from the fleet total and reported
 * every project in the fleet as healthy -- the page at its most reassuring on the least data.
 * The split is therefore derived only from the list itself, and is absent when the list is.
 */
export function projectsReading(
	projects: readonly { priorityBand: string }[],
	fleetProjectCount: number,
	summaryFailed: boolean,
): null | ProjectsReading {
	if (summaryFailed) return null;
	if (projects.length === 0) return { count: fleetProjectCount, split: null };
	const failing = projects.filter((project) => project.priorityBand !== 'healthy').length;
	return {
		count: projects.length,
		split: { failing, healthy: projects.length - failing },
	};
}
