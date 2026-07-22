import { Elysia } from 'elysia';

import type { WebContext } from '../context.ts';

import { readCommitDiff } from '../services/git/commitDiff.ts';
import { readRepositoryRefs } from '../services/git/repoRefs.ts';
import { readRepositoryInfo } from '../services/git/repoStats.ts';
import { projectCommitParams, projectIdParams } from './projects.schemas.ts';

// Mounted inside the `/api/v1/projects` route group, so this instance carries no prefix of its
// own: the parent's prefix is prepended when Elysia absorbs the plugin.
export function projectRepositoryRouteGroup(context: WebContext, prefix: string) {
	return new Elysia({ prefix })
		.get(
			'/:id/commits/:sha',
			async ({ params }) => {
				const projectDir = await context.projectService.resolveDiscoveredProject(params.id);
				return await readCommitDiff(projectDir, params.sha);
			},
			{ params: projectCommitParams }
		)
		.get(
			'/:id/repository-info',
			async ({ params }) => {
				const projectDir = await context.projectService.resolveDiscoveredProject(params.id);
				return await readRepositoryInfo(projectDir);
			},
			{ params: projectIdParams }
		)
		.get(
			'/:id/repository-refs',
			async ({ params }) => {
				const projectDir = await context.projectService.resolveDiscoveredProject(params.id);
				return await readRepositoryRefs(projectDir);
			},
			{ params: projectIdParams }
		);
}
