import type { ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';

import { mkdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';

import type { WebContext } from '../../backend/src/context.ts';
import type { DirectAiRunner } from '../../backend/src/services/directAiService.ts';
import type { RunService } from '../../backend/src/services/runService.ts';

import { encodeProjectId } from '../../backend/src/paths.ts';
import { errorHandlerPlugin } from '../../backend/src/plugins/errorHandler.ts';
import { createAuditsRoutes } from '../../backend/src/routes/audits.ts';
import { createProjectsRoutes } from '../../backend/src/routes/projects.ts';
import { AuditService } from '../../backend/src/services/auditService.ts';
import { ProjectService } from '../../backend/src/services/projectService.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

function webConfig(allowedRoots: string[], dataDir: string): ResolvedWebConfig {
	return {
		allowRemote: false,
		allowedOrigins: [],
		allowedRoots,
		autoChainLimit: 3,
		autoChainRuns: false,
		dataDir,
		hostname: '127.0.0.1',
		ignoredFolders: ['.git', 'node_modules'],
		maxConcurrentRuns: 2,
		maxConcurrentRunsPerProject: 2,
		port: 3210,
		showSpernakitProject: false,
		spernakitFleetManifest: null,
		spernakitInitScript: null,
		spernakitTemplateRef: null,
		spernakitTemplateRepo: 'NomadicDaddy/spernakit',
		templates: [],
		traceDataMovement: false,
		useWorktrees: false,
	};
}

function fullConfig(web: ResolvedWebConfig): { web: ResolvedWebConfig } & ResolvedConfig {
	return {
		cli: 'native',
		dirtyTreeThreshold: 50,
		idleNudgeTimeoutSeconds: 600,
		idleTimeoutSeconds: 900,
		maxConsecutiveTimeoutRetries: 2,
		maxIterations: null,
		noClean: false,
		noWorkBackoffMs: 30_000,
		preflightDoctor: false,
		quitOnAbort: 0,
		rateLimitBackoffSeconds: 300,
		rateLimitBufferSeconds: 60,
		reasoningEffort: 'low',
		timeoutSeconds: 3600,
		web,
	};
}

function projectRoutes(projectService: ProjectService) {
	const context = {
		projectService,
		runService: {
			hasActiveRunForProject: async () => false,
			updateProjectPathReferences: async () => {},
		},
	} as unknown as WebContext;
	return new Elysia().use(errorHandlerPlugin).use(createProjectsRoutes(context));
}

async function errorMessage(response: Response): Promise<string> {
	const body = (await response.json()) as { error: string };
	return body.error;
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

describe('allowed-path request validation', () => {
	test('returns 400 for an out-of-roots project-create spec path', async () => {
		const tempDir = await testTempDir('aidd-path-validation-recommend-');
		try {
			const allowedRoot = join(tempDir, 'allowed');
			const dataDir = join(tempDir, 'data');
			const outsideSpec = join(tempDir, 'outside', 'spec.md');
			await mkdir(allowedRoot, { recursive: true });
			await mkdir(dataDir, { recursive: true });
			const web = webConfig([allowedRoot], dataDir);
			const service = new ProjectService(web);
			service.setAdvisor({
				backendFactory: () => {
					throw new Error('advisor must not launch for invalid input');
				},
				// Path validation happens before the advisor is selected or invoked.
				directAiService: {} as DirectAiRunner,
				getFullConfig: () => fullConfig(web),
			});
			const app = projectRoutes(service);
			const recommendResponse = await app.handle(
				new Request('http://localhost/api/v1/projects/recommend-mode', {
					body: JSON.stringify({
						name: 'demo',
						root: allowedRoot,
						spec: { kind: 'path', value: outsideSpec },
					}),
					headers: { 'content-type': 'application/json' },
					method: 'POST',
				}),
			);
			const createResponse = await app.handle(
				new Request('http://localhost/api/v1/projects/', {
					body: JSON.stringify({
						mode: 'fresh',
						name: 'demo',
						root: allowedRoot,
						spec: { kind: 'path', value: outsideSpec },
					}),
					headers: { 'content-type': 'application/json' },
					method: 'POST',
				}),
			);

			expect(recommendResponse.status).toBe(400);
			expect(await errorMessage(recommendResponse)).toBe(
				`Path is outside allowed roots: ${outsideSpec}`,
			);
			expect(createResponse.status).toBe(400);
			expect(await errorMessage(createResponse)).toBe(
				`Path is outside allowed roots: ${outsideSpec}`,
			);
		} finally {
			await removeTempTree(tempDir);
		}
	});

	test('returns 400 for an out-of-roots project move destination', async () => {
		const tempDir = await testTempDir('aidd-path-validation-move-');
		try {
			const allowedRoot = join(tempDir, 'allowed');
			const sourceProject = join(allowedRoot, 'demo');
			const outsideRoot = join(tempDir, 'outside');
			await mkdir(join(sourceProject, '.aidd'), { recursive: true });
			await mkdir(outsideRoot, { recursive: true });
			const service = new ProjectService(webConfig([allowedRoot], join(tempDir, 'data')));
			const response = await projectRoutes(service).handle(
				new Request(
					`http://localhost/api/v1/projects/${encodeProjectId(sourceProject)}/move`,
					{
						body: JSON.stringify({
							confirmation: sourceProject,
							destinationRoot: outsideRoot,
						}),
						headers: { 'content-type': 'application/json' },
						method: 'POST',
					},
				),
			);

			expect(response.status).toBe(400);
			expect(await errorMessage(response)).toBe(
				`Path is outside allowed roots: ${outsideRoot}`,
			);
		} finally {
			await removeTempTree(tempDir);
		}
	});

	test('requires a matching project path confirmation before moving', async () => {
		const tempDir = await testTempDir('aidd-path-validation-move-confirm-');
		try {
			const sourceRoot = join(tempDir, 'source');
			const destinationRoot = join(tempDir, 'destination');
			const sourceProject = join(sourceRoot, 'demo');
			await mkdir(join(sourceProject, '.aidd'), { recursive: true });
			await mkdir(destinationRoot, { recursive: true });
			const app = projectRoutes(
				new ProjectService(webConfig([sourceRoot, destinationRoot], join(tempDir, 'data'))),
			);
			const endpoint = `http://localhost/api/v1/projects/${encodeProjectId(sourceProject)}/move`;
			const missingResponse = await app.handle(
				new Request(endpoint, {
					body: JSON.stringify({ destinationRoot }),
					headers: { 'content-type': 'application/json' },
					method: 'POST',
				}),
			);
			const mismatchResponse = await app.handle(
				new Request(endpoint, {
					body: JSON.stringify({
						confirmation: destinationRoot,
						destinationRoot,
					}),
					headers: { 'content-type': 'application/json' },
					method: 'POST',
				}),
			);

			expect(missingResponse.status).toBe(400);
			expect(mismatchResponse.status).toBe(400);
			expect(await errorMessage(mismatchResponse)).toBe(
				'Project path confirmation does not match',
			);
			expect(await pathExists(sourceProject)).toBe(true);
		} finally {
			await removeTempTree(tempDir);
		}
	});

	test('moves a confirmed project to another configured root', async () => {
		const tempDir = await testTempDir('aidd-path-validation-move-success-');
		try {
			const sourceRoot = join(tempDir, 'source');
			const destinationRoot = join(tempDir, 'destination');
			const sourceProject = join(sourceRoot, 'demo');
			const destinationProject = join(destinationRoot, 'moved-demo');
			await mkdir(join(sourceProject, '.aidd'), { recursive: true });
			await mkdir(destinationRoot, { recursive: true });
			const response = await projectRoutes(
				new ProjectService(webConfig([sourceRoot, destinationRoot], join(tempDir, 'data'))),
			).handle(
				new Request(
					`http://localhost/api/v1/projects/${encodeProjectId(sourceProject)}/move`,
					{
						body: JSON.stringify({
							confirmation: sourceProject,
							destinationName: 'moved-demo',
							destinationRoot,
						}),
						headers: { 'content-type': 'application/json' },
						method: 'POST',
					},
				),
			);
			const result = (await response.json()) as { project: { path: string } };

			expect(response.status).toBe(200);
			expect(result.project.path).toBe(resolve(destinationProject));
			expect(await pathExists(sourceProject)).toBe(false);
			expect(await pathExists(join(destinationProject, '.aidd'))).toBe(true);
		} finally {
			await removeTempTree(tempDir);
		}
	});

	test('returns 400 for an invalid audit name', async () => {
		const rootDir = await testTempDir('aidd-path-validation-audit-');
		try {
			const projectService = new ProjectService(webConfig([rootDir], join(rootDir, 'data')));
			const auditService = new AuditService(
				fullConfig(webConfig([rootDir], join(rootDir, 'data'))),
				projectService,
				{ launchRun: async () => ({ id: 'unused' }) } as unknown as RunService,
				rootDir,
			);
			const app = new Elysia()
				.use(errorHandlerPlugin)
				.use(createAuditsRoutes({ auditService } as unknown as WebContext));
			const response = await app.handle(
				new Request('http://localhost/api/v1/audits/BAD-NAME', {
					body: JSON.stringify({ content: '# Invalid\n\nShould not be written.' }),
					headers: { 'content-type': 'application/json' },
					method: 'PUT',
				}),
			);

			expect(response.status).toBe(400);
			expect(await errorMessage(response)).toBe('Invalid audit name.');
		} finally {
			await removeTempTree(rootDir);
		}
	});
});
