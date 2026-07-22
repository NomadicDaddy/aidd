import { Elysia } from 'elysia';

import type { WebContext } from '../context.ts';

import { HttpError } from '../services/errors.ts';
import { projectInitFailureParams } from './projects.schemas.ts';

// Init-failure management routes (4b) under /api/v1/projects, registered in server.ts.
// Kept separate so the main projects router stays within the modularity budget.
export function createProjectInitFailureRoutes(context: WebContext) {
	return new Elysia({ prefix: '/api/v1/projects' })
		.post(
			'/init-failures/:fid/dismiss',
			async ({ params }) => {
				const dismissed = await context.initFailureService.dismiss(params.fid);
				if (!dismissed)
					throw new HttpError('Init failure not found or already dismissed', 404);
				return { dismissed: true };
			},
			{ params: projectInitFailureParams }
		)
		.post(
			'/init-failures/:fid/retry',
			async ({ params }) => {
				const failure = await context.initFailureService.getOpen(params.fid);
				if (!failure)
					throw new HttpError('Init failure not found or already dismissed', 404);
				const result = await context.projectService.createProject(
					{
						description: failure.description,
						mode: 'fresh',
						name: failure.name,
						root: failure.root,
						spec: null,
						// A github-template failure retries by re-cloning its persisted source;
						// its template field is a pseudo-name, not a registry entry.
						...(failure.templateUrl
							? { templateUrl: failure.templateUrl }
							: { template: failure.template }),
					},
					(input) => context.runService.launchRun(input),
					(projectPath) => context.runService.purgeProjectRuns(projectPath),
					async (projectDir) => {
						const session = await context.pipelineService.launchRecipe({
							metadataOnly: true,
							projectDir,
							recipeId: 'project-intake',
						});
						return { id: session.id };
					}
				);
				// Retry succeeded: clear the failure so it leaves the fleet.
				await context.initFailureService.dismiss(params.fid);
				return { result };
			},
			{ params: projectInitFailureParams }
		)
		.get(
			'/init-failures/:fid/log',
			async ({ params, set }) => {
				const logPath = await context.initFailureService.getLogPath(params.fid);
				if (!logPath) throw new HttpError('No log available for this init failure', 404);
				const file = Bun.file(logPath);
				if (!(await file.exists())) throw new HttpError('Log file no longer exists', 404);
				set.headers['content-type'] = 'text/plain; charset=utf-8';
				return await file.text();
			},
			{ params: projectInitFailureParams }
		);
}
