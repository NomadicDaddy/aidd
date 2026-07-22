import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Elysia } from 'elysia';
import { describe, expect, test } from 'bun:test';
import type { WebContext } from '../../backend/src/context.ts';
import { errorHandlerPlugin } from '../../backend/src/plugins/errorHandler.ts';
import { createProjectMaturityRoutes } from '../../backend/src/routes/projectMaturity.ts';

import { testTempDir } from '../_helpers/temp.ts';
interface SkillLaunchCall {
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

function createMaturityTestApp(projectDir: string): {
	app: RequestHandler;
	auditRuns: AuditRunCall[];
	skillLaunches: SkillLaunchCall[];
} {
	const auditRuns: AuditRunCall[] = [];
	const skillLaunches: SkillLaunchCall[] = [];
	const app = new Elysia().use(errorHandlerPlugin).use(
		createProjectMaturityRoutes({
			pipelineService: {
				launchRecipe: async (input: SkillLaunchCall) => {
					skillLaunches.push(input);
					return { id: 'skill-session' };
				},
			},
			projectService: {
				resolveDiscoveredProject: async () => projectDir,
			},
			runService: {
				launchRun: async (input: AuditRunCall) => {
					auditRuns.push(input);
					return { id: 'audit-run' };
				},
			},
		} as unknown as WebContext)
	);
	return { app, auditRuns, skillLaunches };
}

async function postRunNext(
	app: RequestHandler,
	body: { auditName?: string; slug: string }
): Promise<Response> {
	return await app.handle(
		new Request('http://localhost/api/v1/projects/demo/maturity/run-next', {
			body: JSON.stringify(body),
			headers: { 'content-type': 'application/json' },
			method: 'POST',
		})
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
				await readFile(join(projectDir, '.aidd', 'project-profile.json'), 'utf8')
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
			await rm(projectDir, { force: true, recursive: true });
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
			await rm(projectDir, { force: true, recursive: true });
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
			await rm(projectDir, { force: true, recursive: true });
		}
	});

	test('run-next dispatches audit invocations through run service', async () => {
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
			await rm(projectDir, { force: true, recursive: true });
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
			await rm(projectDir, { force: true, recursive: true });
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
			await rm(projectDir, { force: true, recursive: true });
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
			await rm(projectDir, { force: true, recursive: true });
		}
	});
});
