import { Elysia, t } from 'elysia';

import type { WebContext } from '../context.ts';

import { backendNameBody } from './schemas/backend.ts';

const safeModelArg = t.String({ pattern: '^[A-Za-z0-9._:/@-]+$' });

const auditParams = t.Object({ name: t.String({ minLength: 1 }) });
const projectParams = t.Object({ projectId: t.String({ minLength: 1 }) });

const auditSaveBody = t.Object({
	content: t.String({ maxLength: 200_000, minLength: 1 }),
});

const auditLaunchBody = t.Object({
	auditAll: t.Optional(t.Boolean()),
	auditNames: t.Optional(t.Array(t.String())),
	// Optional launch-target override applied to every launched audit/review run.
	backend: t.Optional(backendNameBody),
	model: t.Optional(safeModelArg),
	projectIds: t.Array(t.String(), { minItems: 1 }),
	reasoningEffort: t.Optional(safeModelArg),
	review: t.Optional(t.Boolean()),
});

const profileMappingBody = t.Object({
	$schema: t.Optional(t.String()),
	rules: t.Array(t.Unknown()),
	version: t.Literal(1),
});

const profileOverridesBody = t.Object({
	$schema: t.Optional(t.String()),
	audits: t.Record(t.String(), t.String()),
	rules: t.Array(t.Unknown()),
	version: t.Literal(1),
});

export function createAuditsRoutes(context: WebContext) {
	const auditService = () => {
		if (!context.auditService) throw new Error('Audit service is unavailable.');
		return context.auditService;
	};
	return new Elysia({ prefix: '/api/v1/audits' })
		.get('/', async () => await auditService().listAuditManager())
		.get('/profile-mapping', async () => ({
			...(await auditService().getAuditProfileMapping()),
		}))
		.put(
			'/profile-mapping',
			async ({ body }) => ({
				...(await auditService().saveAuditProfileMapping(body)),
			}),
			{ body: profileMappingBody }
		)
		.get(
			'/project/:projectId',
			async ({ params }) => await auditService().listProjectAudits(params.projectId),
			{ params: projectParams }
		)
		.get(
			'/project-overrides/:projectId',
			async ({ params }) => ({
				overrides: await auditService().getProjectAuditOverrides(params.projectId),
			}),
			{ params: projectParams }
		)
		.put(
			'/project-overrides/:projectId',
			async ({ body, params }) => ({
				overrides: await auditService().saveProjectAuditOverrides(params.projectId, body),
			}),
			{ body: profileOverridesBody, params: projectParams }
		)
		.get(
			'/:name',
			async ({ params }) => ({
				definition: await auditService().readAuditDefinition(params.name),
			}),
			{ params: auditParams }
		)
		.put(
			'/:name',
			async ({ body, params }) => ({
				definition: await auditService().saveAuditDefinition(params.name, body.content),
			}),
			{ body: auditSaveBody, params: auditParams }
		)
		.post(
			'/launch',
			async ({ body }) => ({
				result: await auditService().launchAudits(body),
			}),
			{ body: auditLaunchBody }
		);
}
