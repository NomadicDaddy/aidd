import { Elysia } from 'elysia';

import type { WebContext } from '../context.ts';

import {
	milestoneCreateBody,
	milestoneDeleteBody,
	milestoneReassignBody,
	milestoneUpdateBody,
	projectIdParams,
	projectMilestoneParams,
} from './projects.schemas.ts';

// Roadmap milestone routes, split out of projects.ts to keep each route module cohesive and under
// the file-size budget. Mounted as a sibling plugin in server.ts under the same prefix.
//
// `params.name` is used verbatim: Elysia percent-decodes path params itself (verified — `/m/100%25`
// arrives as `100%`). Decoding a second time here made a name containing a literal `%` resolve to a
// different milestone, so an edit or delete could hit the wrong one. `assertMilestoneParam` in the
// service rejects the separators that decoding can surface.
export function createProjectMilestoneRoutes(context: WebContext) {
	const hasActiveRuns = (projectPath: string) =>
		context.runService.hasActiveRunForProject(projectPath);
	return new Elysia({ prefix: '/api/v1/projects' })
		.get(
			'/:id/milestones',
			async ({ params }) => await context.projectService.milestones.getMilestones(params.id),
			{ params: projectIdParams },
		)
		.post(
			'/:id/milestones',
			async ({ body, params }) =>
				await context.projectService.milestones.createMilestone(
					params.id,
					body,
					hasActiveRuns,
				),
			{
				body: milestoneCreateBody,
				params: projectIdParams,
			},
		)
		.post(
			'/:id/milestones/reassign',
			async ({ body, params }) =>
				await context.projectService.milestones.reassignMilestones(
					params.id,
					body,
					hasActiveRuns,
				),
			{
				body: milestoneReassignBody,
				params: projectIdParams,
			},
		)
		.patch(
			'/:id/milestones/:name',
			async ({ body, params }) =>
				await context.projectService.milestones.updateMilestone(
					params.id,
					params.name,
					body,
					hasActiveRuns,
				),
			{
				body: milestoneUpdateBody,
				params: projectMilestoneParams,
			},
		)
		.delete(
			'/:id/milestones/:name',
			async ({ body, params }) =>
				await context.projectService.milestones.deleteMilestone(
					params.id,
					params.name,
					body,
					hasActiveRuns,
				),
			{
				body: milestoneDeleteBody,
				params: projectMilestoneParams,
			},
		);
}
