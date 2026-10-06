import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Elysia } from 'elysia';
import { describe, expect, test } from 'bun:test';
import type { WebContext } from '../../backend/src/context.ts';
import type { TelemetryService } from '../../backend/src/services/telemetryService.ts';
import { errorHandlerPlugin } from '../../backend/src/plugins/errorHandler.ts';
import { createProjectMaturityRoutes } from '../../backend/src/routes/projectMaturity.ts';
import { launchAuditsImpl } from '../../backend/src/services/audit/launchAuditsImpl.ts';
import { recordAuditRunStart } from '../../backend/src/services/audit/auditTelemetry.ts';
import { ensureProjectProfile } from '../../backend/src/services/project/profile.ts';

import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';
interface SkillLaunchCall {
	initiator?: 'operator';
	launchTarget?: Record<string, string>;
	parameters?: Record<string, string>;
	projectDir: string;
	recipeId: string;
}

interface AuditRunCall {
	auditNames?: string[];
	mode?: string;
	projectDir?: string;
}

interface RequestHandler {
	handle(request: Request): Promise<Response> | Response;
}

interface TelemetryStart {
	resourceId: string;
	resourceType: string;
	runId?: string;
}

// The audit branch goes through the real launch implementation the AuditService delegates to,
// with the run launcher and the telemetry sink recorded, so a card launch is proven to get the
// audits-disabled refusal and the telemetry start that POST /api/v1/audits/launch gets.
function createMaturityTestApp(
	projectDir: string,
	options: { auditsEnabled?: boolean } = {},
): {
	app: RequestHandler;
	auditRuns: AuditRunCall[];
	skillLaunches: SkillLaunchCall[];
	telemetryStarts: TelemetryStart[];
} {
	const auditRuns: AuditRunCall[] = [];
	const skillLaunches: SkillLaunchCall[] = [];
	const telemetryStarts: TelemetryStart[] = [];
	const telemetry = {
		recordStart: async (input: TelemetryStart) => {
			telemetryStarts.push({
				resourceId: input.resourceId,
				resourceType: input.resourceType,
				...(input.runId !== undefined ? { runId: input.runId } : {}),
			});
		},
	} as unknown as TelemetryService;
	const resolveDiscoveredProject = async () => projectDir;
	const app = new Elysia().use(errorHandlerPlugin).use(
		createProjectMaturityRoutes({
			auditService: {
				launchAudits: (input: Parameters<typeof launchAuditsImpl>[0]) =>
					launchAuditsImpl(input, {
						auditsEnabled: options.auditsEnabled ?? true,
						launchRun: async (request) => {
							auditRuns.push({
								...(request.auditNames ? { auditNames: request.auditNames } : {}),
								...(request.mode !== undefined ? { mode: request.mode } : {}),
								projectDir: request.projectDir,
							});
							return {
								backend: 'native',
								id: 'audit-run',
								model: 'test-model',
								projectName: 'demo',
								projectPath: projectDir,
								startedAt: Date.now(),
							} as Awaited<ReturnType<WebContext['runService']['launchRun']>>;
						},
						recordRunStart: (run, auditNames) =>
							recordAuditRunStart(telemetry, run, 'web', auditNames),
						resolveProject: resolveDiscoveredProject,
					}),
			},
			pipelineService: {
				launchRecipe: async (input: SkillLaunchCall) => {
					skillLaunches.push(input);
					return { id: 'skill-session' };
				},
			},
			projectService: {
				ensureProjectProfile: (projectId: string) =>
					ensureProjectProfile(
						{ invalidateProjectListing: () => {}, resolveDiscoveredProject },
						projectId,
					),
				resolveDiscoveredProject,
			},
		} as unknown as WebContext),
	);
	return { app, auditRuns, skillLaunches, telemetryStarts };
}

async function postRunNext(
	app: RequestHandler,
	body: { auditName?: string; slug: string },
): Promise<Response> {
	return await app.handle(
		new Request('http://localhost/api/v1/projects/demo/maturity/run-next', {
			body: JSON.stringify(body),
			headers: { 'content-type': 'application/json' },
			method: 'POST',
		}),
	);
}

describe('project maturity routes', () => {
	test('run-next creates an explicit project profile without launching a command', async () => {
		const projectDir = await testTempDir('aidd-maturity-profile-');
		try {
			const { app, skillLaunches } = createMaturityTestApp(projectDir);

			const response = await postRunNext(app, { slug: 'project-profile.json' });

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({
				hint: 'Created .aidd/project-profile.json from the inferred profile.',
				invocation: 'profile',
				slug: 'project-profile.json',
				target: '.aidd/project-profile.json',
			});
			expect(skillLaunches).toEqual([]);

			const profile = JSON.parse(
				await readFile(join(projectDir, '.aidd', 'project-profile.json'), 'utf8'),
			) as Record<string, unknown>;
			expect(profile).toMatchObject({
				authMode: 'local_owner',
				bucket: 'single_user_local',
				criticality: 'utility',
				dataSensitivity: 'low',
				deployment: 'local',
				externalIntegrations: 'none',
				source: 'explicit',
			});
			expect(typeof profile.updatedAt).toBe('string');
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('run-next dispatches skill invocations through the pipeline service', async () => {
		const projectDir = await testTempDir('aidd-maturity-skill-');
		try {
			const { app, auditRuns, skillLaunches } = createMaturityTestApp(projectDir);

			const response = await postRunNext(app, { slug: 'screen-map.md' });

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				args: projectDir,
				command: `update-screen-map ${projectDir}`,
				skillId: 'update-screen-map',
				invocation: 'skill',
				sessionId: 'skill-session',
				slug: 'screen-map.md',
			});
			expect(skillLaunches).toEqual([
				{
					initiator: 'operator',
					launchTarget: {},
					parameters: {
						args: projectDir,
						backend: '',
						executionIntent: 'apply-changes',
						model: '',
					},
					projectDir,
					recipeId: 'skill:update-screen-map',
				},
			]);
			expect(auditRuns).toEqual([]);
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('run-next includes the post-script for skill invocations that declare one', async () => {
		const projectDir = await testTempDir('aidd-maturity-postscript-');
		try {
			const { app, skillLaunches } = createMaturityTestApp(projectDir);

			const response = await postRunNext(app, { slug: 'roadmap.json' });

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				skillId: 'update-roadmap',
				invocation: 'skill',
				postScript: `bun run aidd-tools -- roadmap:apply --project-dir ${projectDir}`,
				sessionId: 'skill-session',
				slug: 'roadmap.json',
			});
			expect(skillLaunches).toEqual([
				{
					initiator: 'operator',
					launchTarget: {},
					parameters: {
						args: projectDir,
						backend: '',
						executionIntent: 'apply-changes',
						model: '',
					},
					projectDir,
					recipeId: 'skill:update-roadmap',
				},
			]);
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('run-next dispatches audit invocations through the audit launch service', async () => {
		const projectDir = await testTempDir('aidd-maturity-audit-');
		try {
			const { app, auditRuns, skillLaunches } = createMaturityTestApp(projectDir);

			const response = await postRunNext(app, { auditName: 'SECURITY', slug: 'audits' });

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({
				auditName: 'SECURITY',
				invocation: 'audit',
				runId: 'audit-run',
				slug: 'audits',
			});
			expect(auditRuns).toEqual([
				{
					auditNames: ['SECURITY'],
					mode: 'audit',
					projectDir,
				},
			]);
			expect(skillLaunches).toEqual([]);
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('run-next accepts audit action slugs emitted by maturity rows', async () => {
		const projectDir = await testTempDir('aidd-maturity-audit-slug-');
		try {
			const { app, auditRuns, skillLaunches } = createMaturityTestApp(projectDir);

			const response = await postRunNext(app, { slug: 'audit:SECURITY' });

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({
				auditName: 'SECURITY',
				invocation: 'audit',
				runId: 'audit-run',
				slug: 'audit:SECURITY',
			});
			expect(auditRuns).toEqual([
				{
					auditNames: ['SECURITY'],
					mode: 'audit',
					projectDir,
				},
			]);
			expect(skillLaunches).toEqual([]);
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('run-next returns non-run instructions for manual and feature invocations', async () => {
		const projectDir = await testTempDir('aidd-maturity-non-run-');
		try {
			const { app, auditRuns, skillLaunches } = createMaturityTestApp(projectDir);

			const manualResponse = await postRunNext(app, { slug: 'project.md' });
			const featureResponse = await postRunNext(app, { slug: 'feature.json' });

			expect(manualResponse.status).toBe(200);
			expect(await manualResponse.json()).toEqual({
				hint: 'Edit .aidd/project.md directly — this file is maintained by hand.',
				invocation: 'manual',
				slug: 'project.md',
				target: '.aidd/project.md',
			});
			expect(featureResponse.status).toBe(200);
			expect(await featureResponse.json()).toEqual({
				hint: 'Navigate to feature creation flow.',
				invocation: 'feature',
				slug: 'feature.json',
			});
			expect(skillLaunches).toEqual([]);
			expect(auditRuns).toEqual([]);
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('run-next rejects audit invocations without an audit name', async () => {
		const projectDir = await testTempDir('aidd-maturity-audit-missing-');
		try {
			const { app, auditRuns, skillLaunches } = createMaturityTestApp(projectDir);

			const response = await postRunNext(app, { slug: 'audits' });

			expect(response.status).toBe(400);
			expect(skillLaunches).toEqual([]);
			expect(auditRuns).toEqual([]);
		} finally {
			await removeTempTree(projectDir);
		}
	});

	// audit-architecture-1790856991: the route launched audits straight through runService, so a
	// card launch skipped the audits-disabled refusal and never recorded a telemetry start.
	test('run-next refuses an audit with 409 when audits are disabled, launching nothing', async () => {
		const projectDir = await testTempDir('aidd-maturity-audit-disabled-');
		try {
			const { app, auditRuns, telemetryStarts } = createMaturityTestApp(projectDir, {
				auditsEnabled: false,
			});

			const response = await postRunNext(app, { slug: 'audit:SECURITY' });

			expect(response.status).toBe(409);
			expect(auditRuns).toEqual([]);
			expect(telemetryStarts).toEqual([]);
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('run-next records exactly one telemetry start for the launched audit run', async () => {
		const projectDir = await testTempDir('aidd-maturity-audit-telemetry-');
		try {
			const { app, telemetryStarts } = createMaturityTestApp(projectDir);

			const response = await postRunNext(app, { slug: 'audit:SECURITY' });

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({ runId: 'audit-run' });
			expect(telemetryStarts).toEqual([
				{ resourceId: 'audit-run', resourceType: 'run', runId: 'audit-run' },
			]);
		} finally {
			await removeTempTree(projectDir);
		}
	});
});
