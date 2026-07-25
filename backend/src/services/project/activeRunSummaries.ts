import type { ProjectActiveRunSummaryDto, ProjectsListResponseDto } from '../../types.ts';

export type ActiveRunSummaryProvider = (
	projectPaths: readonly string[],
) => Promise<ReadonlyMap<string, ProjectActiveRunSummaryDto>>;

export async function applyActiveRunSummaries(
	response: ProjectsListResponseDto,
	provider: ActiveRunSummaryProvider | null,
): Promise<void> {
	const activeRuns = provider
		? await provider(response.projects.map((project) => project.path))
		: new Map<string, ProjectActiveRunSummaryDto>();
	response.projects = response.projects.map((project) => ({
		...project,
		activeRuns: activeRuns.get(project.path) ?? { count: 0, latestRunId: null },
	}));
}
