import { Elysia } from 'elysia';

import type { WebContext } from '../context.ts';

import { readProjectCodeFile, readProjectCodeTree } from '../services/project/codeView.ts';
import { projectCodeFileQuery, projectIdParams } from './projects.schemas.ts';

export function createProjectCodeRoutes(context: WebContext) {
	return new Elysia({ prefix: '/api/v1/projects' })
		.get(
			'/:id/code/tree',
			async ({ params }) => {
				const projectDir = await context.projectService.resolveDiscoveredProject(params.id);
				return await readProjectCodeTree(projectDir);
			},
			{
				params: projectIdParams,
			},
		)
		.get(
			'/:id/code/file',
			async ({ params, query }) => {
				const projectDir = await context.projectService.resolveDiscoveredProject(params.id);
				return await readProjectCodeFile(projectDir, query.path);
			},
			{
				params: projectIdParams,
				query: projectCodeFileQuery,
			},
		);
}
