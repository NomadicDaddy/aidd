import type { LaunchTargetOverrides } from 'aidd-shared/plan/launch-target';

import { MATURITY_INVOCATIONS, resolveInvocation } from 'aidd-shared/metadata/maturity';
import {
	readProjectAssuranceProfile,
	writeProjectAssuranceProfile,
} from 'aidd-shared/metadata/project-profile';
import { Elysia, t } from 'elysia';

import type { WebContext } from '../context.ts';

import { HttpError } from '../services/errors.ts';
import { SKILL_RECIPE_PREFIX } from '../services/recipeService.ts';
import { backendNameBody } from './schemas/backend.ts';

const safeModelArg = t.String({ pattern: '^[A-Za-z0-9._:/@-]+$' });

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

const AUDIT_ACTION_SLUG_PREFIX = 'audit:';

function normalizeRunNextInput(
	slug: string,
	auditName: string | undefined
): { auditName?: string; invocationSlug: string; responseSlug: string } {
	if (!slug.startsWith(AUDIT_ACTION_SLUG_PREFIX)) {
		return {
			...(auditName ? { auditName } : {}),
			invocationSlug: slug,
			responseSlug: slug,
		};
	}
	const slugAuditName = slug.slice(AUDIT_ACTION_SLUG_PREFIX.length).trim();
	if (!slugAuditName) throw new HttpError('auditName is required for audit invocations', 400);
	if (auditName && auditName !== slugAuditName) {
		throw new HttpError('auditName must match the audit action slug', 400);
	}
	return { auditName: slugAuditName, invocationSlug: 'audits', responseSlug: slug };
}

async function dispatchRunNext(
	context: WebContext,
	projectId: string,
	slug: string,
	auditName?: string,
	launchTarget: LaunchTargetOverrides = {}
): Promise<{
	args?: string;
	auditName?: string;
	command?: string;
	hint?: string;
	invocation: string;
	postScript?: string;
	runId?: string;
	sessionId?: string;
	skillId?: string;
	slug: string;
	target?: string;
}> {
	const projectDir = await context.projectService.resolveDiscoveredProject(projectId);
	const normalized = normalizeRunNextInput(slug, auditName);
	const definition = MATURITY_INVOCATIONS[normalized.invocationSlug];
	if (!definition) throw new HttpError(`Unknown maturity slug: ${slug}`, 400);
	const invocation = resolveInvocation(
		normalized.invocationSlug,
		projectDir,
		normalized.auditName
	);
	if (!invocation) throw new HttpError(`Unable to resolve invocation for ${slug}`, 400);
	switch (invocation.kind) {
		case 'audit': {
			if (!normalized.auditName) {
				throw new HttpError('auditName is required for audit invocations', 400);
			}
			const run = await context.runService.launchRun({
				auditNames: [normalized.auditName],
				mode: 'audit',
				projectDir,
				...(launchTarget.backend !== undefined ? { backend: launchTarget.backend } : {}),
				...(launchTarget.model !== undefined ? { model: launchTarget.model } : {}),
				...(launchTarget.reasoningEffort !== undefined
					? { reasoningEffort: launchTarget.reasoningEffort }
					: {}),
			});
			return {
				auditName: normalized.auditName,
				invocation: 'audit',
				runId: run.id,
				slug: normalized.responseSlug,
			};
		}
		case 'feature': {
			return {
				hint: 'Navigate to feature creation flow.',
				invocation: 'feature',
				slug,
			};
		}
		case 'manual': {
			return {
				hint: invocation.hint,
				invocation: 'manual',
				slug,
				target: invocation.target,
			};
		}
		case 'profile': {
			const inferred = await readProjectAssuranceProfile(projectDir);
			await writeProjectAssuranceProfile(projectDir, {
				authMode: inferred.authMode,
				bucket: inferred.bucket,
				criticality: inferred.criticality,
				dataSensitivity: inferred.dataSensitivity,
				deployment: inferred.deployment,
				externalIntegrations: inferred.externalIntegrations,
				...(inferred.notes ? { notes: inferred.notes } : {}),
			});
			return {
				hint: 'Created .aidd/project-profile.json from the inferred profile.',
				invocation: invocation.kind,
				slug,
				target: '.aidd/project-profile.json',
			};
		}
		case 'skill': {
			const session = await context.pipelineService.launchRecipe({
				launchTarget,
				parameters: {
					args: invocation.args ?? '',
					backend: '',
					executionIntent: invocation.executionIntent,
					model: '',
				},
				projectDir,
				recipeId: `${SKILL_RECIPE_PREFIX}${invocation.skillId}`,
			});
			return {
				command: `${invocation.skillId}${invocation.args ? ` ${invocation.args}` : ''}`,
				invocation: invocation.kind,
				...(invocation.args ? { args: invocation.args } : {}),
				...(invocation.postScript ? { postScript: invocation.postScript } : {}),
				sessionId: session.id,
				skillId: invocation.skillId,
				slug,
			};
		}
	}
}

export function createProjectMaturityRoutes(context: WebContext) {
	return new Elysia({ prefix: '/api/v1/projects' })
		.post(
			'/:id/maturity/skip',
			async ({ body, params }) =>
				await context.projectService.updateMaturitySkip(params.id, body.skip),
			{
				body: skipBody,
				params: projectIdParams,
			}
		)
		.post(
			'/:id/maturity/run-next',
			async ({ body, params }) =>
				await dispatchRunNext(context, params.id, body.slug, body.auditName, {
					backend: body.backend,
					model: body.model,
					reasoningEffort: body.reasoningEffort,
				}),
			{
				body: runNextBody,
				params: projectIdParams,
			}
		);
}
