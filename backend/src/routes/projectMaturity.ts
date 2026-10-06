import { SAFE_BACKEND_ARG_PATTERN } from 'aidd-shared/backends/safe-arg';
import { Elysia, t } from 'elysia';

import type { WebContext } from '../context.ts';

import { HttpError } from '../services/errors.ts';
import { dispatchMaturityRunNext } from '../services/maturity/runNext.ts';
import { backendNameBody } from './schemas/backend.ts';

const safeModelArg = t.String({ pattern: SAFE_BACKEND_ARG_PATTERN });

const projectIdParams = t.Object({ id: t.String() });

const skipBody = t.Object({
	skip: t.Array(t.String({ maxLength: 200, minLength: 1 }), { maxItems: 200 }),
});

const runNextBody = t.Object({
	auditName: t.Optional(t.String({ maxLength: 200, minLength: 1 })),
	// Optional launch-target override for the run/session this action starts.
	backend: t.Optional(backendNameBody),
	model: t.Optional(safeModelArg),
	reasoningEffort: t.Optional(safeModelArg),
	slug: t.String({ maxLength: 200, minLength: 1 }),
});

export function createProjectMaturityRoutes(context: WebContext) {
	return new Elysia({ prefix: '/api/v1/projects' })
		.post(
			'/:id/maturity/skip',
			async ({ body, params }) =>
				await context.projectService.updateMaturitySkip(params.id, body.skip),
			{
				body: skipBody,
				params: projectIdParams,
			},
		)
		.post(
			'/:id/maturity/run-next',
			async ({ body, params }) =>
				await dispatchMaturityRunNext(
					{
						ensureProfile: (projectId) =>
							context.projectService.ensureProjectProfile(projectId),
						launchAudits: (input) => {
							// The audit service owns the audits-disabled refusal and the telemetry
							// start; a maturity card launch gets both or does not launch.
							if (context.auditService === undefined) {
								throw new HttpError('Audit launches are unavailable.', 503);
							}
							return context.auditService.launchAudits(input);
						},
						launchRecipe: (input) => context.pipelineService.launchRecipe(input),
						resolveProject: (projectId) =>
							context.projectService.resolveDiscoveredProject(projectId),
					},
					{
						auditName: body.auditName,
						launchTarget: {
							...(body.backend !== undefined ? { backend: body.backend } : {}),
							...(body.model !== undefined ? { model: body.model } : {}),
							...(body.reasoningEffort !== undefined
								? { reasoningEffort: body.reasoningEffort }
								: {}),
						},
						projectId: params.id,
						slug: body.slug,
					},
				),
			{
				body: runNextBody,
				params: projectIdParams,
			},
		);
}
