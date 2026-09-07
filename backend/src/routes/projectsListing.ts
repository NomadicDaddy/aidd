import type { ProjectService } from '../services/projectService.ts';

import { readProjectGitStatusMap } from '../services/git/status.ts';

export async function listProjectsWithoutFeatureStatus(projectService: ProjectService) {
	const listing = await projectService.listProjects();
	return {
		...listing,
		projects: listing.projects.map(({ featureStatus: _omitted, ...project }) => project),
	};
}

export async function listProjectGitStatuses(projectService: ProjectService) {
	const { projects } = await projectService.listProjectNames();
	return { projects: await readProjectGitStatusMap(projects) };
}
