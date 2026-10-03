import type { ProjectService } from '../services/projectService.ts';

import { readProjectGitStatusMap } from '../services/git/status.ts';

/**
 * The Projects page listing. Each project's feature status and its run and iteration history are
 * left out: the list pages never read them, and the history alone was three quarters of a 1.2 MB
 * response on a 63-project fleet. The project detail endpoint still carries all three.
 */
export async function listProjectsWithoutFeatureStatus(projectService: ProjectService) {
	const listing = await projectService.listProjects();
	return {
		...listing,
		projects: listing.projects.map(({ featureStatus: _status, metadata, ...project }) => {
			const { localIterations: _iterations, localRuns: _runs, ...listed } = metadata;
			return { ...project, metadata: listed };
		}),
	};
}

export async function listProjectGitStatuses(projectService: ProjectService) {
	const { projects } = await projectService.listProjectNames();
	return { projects: await readProjectGitStatusMap(projects) };
}
