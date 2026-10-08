import { Elysia } from 'elysia';

import type { WebContext } from '../context.ts';

import { HttpError } from '../services/errors.ts';
import { launchProjectIntake } from '../services/project/intakeLaunch.ts';
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
			{ params: projectInitFailureParams },
		)
		.post(
			'/init-failures/:fid/retry',
			async ({ params }) => {
				const result = await context.initFailureService.retry(params.fid, (input) =>
					context.projectService.createProject(
						input,
						(req) => context.runService.launchRun(req, { initiator: 'operator' }),
						(projectPath) => context.runService.purgeProjectRuns(projectPath),
						(projectDir, launchTarget) =>
							launchProjectIntake(context.pipelineService, projectDir, launchTarget),
					),
				);
				if (!result)
					throw new HttpError('Init failure not found or already dismissed', 404);
				return { result };
			},
			{ params: projectInitFailureParams },
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
			{ params: projectInitFailureParams },
		);
}
