import { normalizeProjectAssuranceProfileInput } from 'aidd-shared';
import { Elysia } from 'elysia';

import type { WebContext } from '../context.ts';

import { HttpError } from '../services/errors.ts';
import { readProjectGitStatus, readProjectGitStatusMap } from '../services/git/status.ts';
import {
	getProjectInterviewDetail,
	submitProjectInterviewAnswer,
} from '../services/interviewService.ts';
import { readProjectFile } from '../services/project/fileContent.ts';
import { listProjectReports, submitProjectReport } from '../services/projectReports.ts';
import { projectRepositoryRouteGroup } from './projectRepository.ts';
import {
	interviewResponseBody,
	projectCreateBody,
	projectDeleteBody,
	projectFileQuery,
	projectIdParams,
	projectImportBody,
	projectIntakePreviewQuery,
	projectMoveBody,
	projectProfileBody,
	projectProfilePreviewsBody,
	projectRecommendBody,
	projectReportBody,
	projectStartImplementationBody,
} from './projects.schemas.ts';
import {
	createProjectProfilePreview,
	createProjectProfilePreviews,
} from './projectsProfilePreview.ts';

export function createProjectsRoutes(context: WebContext) {
	return (
		new Elysia({ prefix: '/api/v1/projects' })
			.get('/', async () => await context.projectService.listProjects())
			.get('/names', async () => await context.projectService.listProjectNames())
			.get(
				'/import-candidates',
				async () => await context.projectService.listImportCandidates(),
			)
			.get(
				'/intake-preview',
				async ({ query }) => ({
					preview: await context.projectService.getIntakePreview(query.path),
				}),
				{ query: projectIntakePreviewQuery },
			)
			.get('/port-status', async () => await context.projectService.getPortStatus())
			.get('/git-status', async () => {
				const { projects } = await context.projectService.listProjectNames();
				return { projects: await readProjectGitStatusMap(projects) };
			})
			.get(
				'/:id/git-status',
				async ({ params }) => {
					const projectDir = await context.projectService.resolveDiscoveredProject(
						params.id,
					);
					return { status: await readProjectGitStatus(projectDir) };
				},
				{
					params: projectIdParams,
				},
			)
			.post(
				'/',
				async ({ body }) =>
					await context.projectService.createProject(
						{
							...body,
							description: body.description ?? null,
							launchTarget: {
								backend: body.backend,
								model: body.model,
								reasoningEffort: body.reasoningEffort,
							},
							spec: body.spec ?? null,
						},
						(input) => context.runService.launchRun(input),
						(projectPath) => context.runService.purgeProjectRuns(projectPath),
						async (projectDir, launchTarget) => {
							const session = await context.pipelineService.launchRecipe({
								launchTarget,
								metadataOnly: true,
								projectDir,
								recipeId: 'project-intake',
							});
							return { id: session.id };
						},
					),
				{
					body: projectCreateBody,
				},
			)
			.post(
				'/:id/start-implementation',
				async ({ body, params }) =>
					await context.projectService.startImplementation(
						params.id,
						{
							backend: body.backend,
							model: body.model,
							reasoningEffort: body.reasoningEffort,
						},
						(projectPath) => context.runService.hasActiveRunForProject(projectPath),
						(input) => context.runService.launchRun(input),
					),
				{
					body: projectStartImplementationBody,
					params: projectIdParams,
				},
			)
			.post(
				'/recommend-mode',
				async ({ body }) => await context.projectService.recommendProjectMode(body),
				{
					body: projectRecommendBody,
				},
			)
			.post(
				'/profile-previews',
				async ({ body }) => ({
					previews: await createProjectProfilePreviews(context, body.profiles),
				}),
				{
					body: projectProfilePreviewsBody,
				},
			)
			.post(
				'/import',
				async ({ body }) =>
					await context.projectService.importProjects(
						body.candidateIds,
						body.action ?? 'register',
						async (projectDir) => {
							const session = await context.pipelineService.launchRecipe({
								metadataOnly: true,
								projectDir,
								recipeId: 'project-intake',
							});
							return { id: session.id };
						},
					),
				{
					body: projectImportBody,
				},
			)
			.get(
				'/:id',
				async ({ params }) => ({
					project: await context.projectService.getProjectDetail(params.id),
				}),
				{
					params: projectIdParams,
				},
			)
			.put(
				'/:id/profile',
				async ({ body, params }) => ({
					profile: await context.projectService.updateProjectProfile(
						params.id,
						normalizeProjectAssuranceProfileInput(body),
					),
				}),
				{
					body: projectProfileBody,
					params: projectIdParams,
				},
			)
			// Recompute the profile's downstream posture and audit applicability for a *candidate*
			// (unsaved) set of facets, so the Profile Lab can recalc in real time without persisting.
			// Mirrors the same shared resolvers the director and Stage-6 maturity use, and honors the
			// project's per-project audit overrides.
			.post(
				'/:id/profile/preview',
				async ({ body, params }) => ({
					preview: await createProjectProfilePreview(context, params.id, body),
				}),
				{
					body: projectProfileBody,
					params: projectIdParams,
				},
			)
			.delete(
				'/:id',
				async ({ body, params }) => ({
					deleted: await context.projectService.deleteProject(
						params.id,
						body,
						(projectPath) => context.runService.hasActiveRunForProject(projectPath),
						(projectPath) => context.runService.purgeProjectRuns(projectPath),
					),
				}),
				{
					body: projectDeleteBody,
					params: projectIdParams,
				},
			)
			.post(
				'/:id/move',
				async ({ body, params }) => ({
					project: await context.projectService.moveProject(
						params.id,
						body,
						(projectPath) => context.runService.hasActiveRunForProject(projectPath),
						(sourcePath, destinationPath) =>
							context.runService.updateProjectPathReferences(
								sourcePath,
								destinationPath,
							),
					),
				}),
				{
					body: projectMoveBody,
					params: projectIdParams,
				},
			)
			.get(
				'/:id/interview',
				async ({ params }) => {
					const projectDir = await context.projectService.resolveDiscoveredProject(
						params.id,
					);
					return { interview: await getProjectInterviewDetail(projectDir) };
				},
				{
					params: projectIdParams,
				},
			)
			.get(
				'/:id/reports',
				async ({ params }) => {
					const projectDir = await context.projectService.resolveDiscoveredProject(
						params.id,
					);
					return await listProjectReports(projectDir);
				},
				{
					params: projectIdParams,
				},
			)
			.get(
				'/:id/file',
				async ({ params, query }) => {
					const projectDir = await context.projectService.resolveDiscoveredProject(
						params.id,
					);
					return await readProjectFile(projectDir, query.path);
				},
				{
					params: projectIdParams,
					query: projectFileQuery,
				},
			)
			.post(
				'/:id/reports',
				async ({ body, params }) => {
					const projectDir = await context.projectService.resolveDiscoveredProject(
						params.id,
					);
					const report = await submitProjectReport(projectDir, body);
					return { report };
				},
				{
					body: projectReportBody,
					params: projectIdParams,
				},
			)
			.post(
				'/:id/interview/responses',
				async ({ body, params }) => {
					const projectDir = await context.projectService.resolveDiscoveredProject(
						params.id,
					);
					try {
						const interview = await submitProjectInterviewAnswer(projectDir, body);
						return { interview };
					} catch (err) {
						if (err instanceof HttpError) throw err;
						if (err instanceof Error) throw new HttpError(err.message, 400);
						throw err;
					}
				},
				{
					body: interviewResponseBody,
					params: projectIdParams,
				},
			)
			.use(projectRepositoryRouteGroup(context, ''))
	);
}
