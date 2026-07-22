import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Elysia } from 'elysia';
import { describe, expect, test } from 'bun:test';
import type { WebContext } from '../../backend/src/context.ts';
import { errorHandlerPlugin } from '../../backend/src/plugins/errorHandler.ts';
import { createSkillsRoutes } from '../../backend/src/routes/skills.ts';
import { HttpError } from '../../backend/src/services/errors.ts';
import { SkillService } from '../../backend/src/services/skillService.ts';

import { testTempDir } from '../_helpers/temp.ts';
const demoSkill = {
	body: '# Demo\n',
	category: 'runtime',
	description: 'Demo skill.',
	extensions: {},
	id: 'demo',
	metadata: { 'aidd-category': 'runtime' },
	origin: 'bundled',
	sourcePath: 'skills/demo/SKILL.md',
	supportPaths: [],
	title: 'Demo',
	usage: 'demo',
};

const demoSession = {
	id: 'pipe_1',
	recipeId: 'skill:demo',
	recipeName: 'Demo',
	status: 'queued',
};

describe('skills routes', () => {
	test('lists, reads, and runs aidd-local skills as one-shot pipeline sessions', async () => {
		const launches: unknown[] = [];
		const imports: unknown[] = [];
		const deletions: unknown[] = [];
		const app = createSkillsRoutes({
			skillService: {
				deleteImportedSkill: async (id: string, references: string[]) => {
					deletions.push({ id, references });
				},
				importSkill: async (input: unknown) => {
					imports.push(input);
					return { ...demoSkill, origin: 'imported' };
				},
				listSkills: async () => [demoSkill],
				previewImport: async (input: unknown) => ({
					category: 'general',
					conflict: 'none',
					description: 'Demo skill.',
					fileCount: 1,
					id: 'demo',
					sourcePath: (input as { sourcePath: string }).sourcePath,
					sourceSha256: 'a'.repeat(64),
					title: 'Demo',
					totalBytes: 100,
				}),
				readSkill: async (id: string) => ({ ...demoSkill, id }),
			},
			pipelineService: {
				launchRecipe: async (input: unknown) => {
					launches.push(input);
					return demoSession;
				},
			},
			recipeService: { listRecipes: async () => [] },
		} as unknown as WebContext);

		const listResponse = await app.handle(new Request('http://localhost/api/v1/skills'));
		expect(listResponse.status).toBe(200);
		expect(await listResponse.json()).toEqual({ skills: [demoSkill] });

		const readResponse = await app.handle(new Request('http://localhost/api/v1/skills/demo'));
		expect(readResponse.status).toBe(200);
		expect(await readResponse.json()).toEqual({ skill: demoSkill });

		const previewResponse = await app.handle(
			new Request('http://localhost/api/v1/skills/imports/preview', {
				body: JSON.stringify({ category: 'general', sourcePath: 'D:/skills/demo' }),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			})
		);
		expect(previewResponse.status).toBe(200);
		expect(await previewResponse.json()).toMatchObject({ preview: { id: 'demo' } });

		const importResponse = await app.handle(
			new Request('http://localhost/api/v1/skills/imports', {
				body: JSON.stringify({ replace: true, sourcePath: 'D:/skills/demo' }),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			})
		);
		expect(importResponse.status).toBe(200);
		expect(imports).toEqual([{ replace: true, sourcePath: 'D:/skills/demo' }]);

		const deleteResponse = await app.handle(
			new Request('http://localhost/api/v1/skills/imports/demo', { method: 'DELETE' })
		);
		expect(deleteResponse.status).toBe(200);
		expect(deletions).toEqual([{ id: 'demo', references: [] }]);

		const runResponse = await app.handle(
			new Request('http://localhost/api/v1/skills/demo/run', {
				body: JSON.stringify({
					args: 'sample',
					backend: 'native',
					executionIntent: 'review-only',
					model: 'demo-model',
					projectDir: 'D:/applications/demo',
					reasoningEffort: 'high',
				}),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			})
		);
		expect(runResponse.status).toBe(200);
		expect(await runResponse.json()).toEqual({ session: demoSession });
		expect(launches).toEqual([
			{
				// The session-level override carries the choice; the synthetic recipe
				// parameters stay populated for pre-launchTarget session compatibility.
				launchTarget: { backend: 'native', model: 'demo-model', reasoningEffort: 'high' },
				parameters: {
					args: 'sample',
					backend: 'native',
					executionIntent: 'review-only',
					model: 'demo-model',
				},
				projectDir: 'D:/applications/demo',
				recipeId: 'skill:demo',
			},
		]);
	});

	test('rejects invalid backend values before launching a session', async () => {
		const launches: unknown[] = [];
		const app = new Elysia().use(errorHandlerPlugin).use(
			createSkillsRoutes({
				skillService: {
					listSkills: async () => [],
					readSkill: async () => demoSkill,
				},
				pipelineService: {
					launchRecipe: async (input: unknown) => {
						launches.push(input);
						return demoSession;
					},
				},
			} as unknown as WebContext)
		);

		const response = await app.handle(
			new Request('http://localhost/api/v1/skills/demo/run', {
				body: JSON.stringify({
					backend: 'nope',
					executionIntent: 'review-only',
					projectDir: 'D:/applications/demo',
				}),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			})
		);

		expect(response.status).toBe(400);
		expect(launches).toEqual([]);
	});

	test('requires a valid execution intent before launching a skill session', async () => {
		const launches: unknown[] = [];
		const app = new Elysia().use(errorHandlerPlugin).use(
			createSkillsRoutes({
				skillService: { listSkills: async () => [], readSkill: async () => demoSkill },
				pipelineService: {
					launchRecipe: async (input: unknown) => {
						launches.push(input);
						return demoSession;
					},
				},
			} as unknown as WebContext)
		);

		for (const executionIntent of [undefined, 'audit', 'apply']) {
			const response = await app.handle(
				new Request('http://localhost/api/v1/skills/demo/run', {
					body: JSON.stringify({ executionIntent, projectDir: 'D:/applications/demo' }),
					headers: { 'content-type': 'application/json' },
					method: 'POST',
				})
			);
			expect(response.status).toBe(400);
			expect(await response.text()).toContain('executionIntent must be either');
		}
		expect(launches).toEqual([]);
	});

	test('returns actionable launch errors without creating a pipeline session', async () => {
		const launches: unknown[] = [];
		const app = new Elysia().use(errorHandlerPlugin).use(
			createSkillsRoutes({
				skillService: {
					listSkills: async () => [],
					readSkill: async (id: string) => {
						if (id === 'missing') throw new HttpError('Skill not found: missing', 404);
						return demoSkill;
					},
				},
				pipelineService: {
					launchRecipe: async (input: unknown) => {
						if (
							(input as { projectDir: string }).projectDir ===
							'D:/outside-allowed-root'
						) {
							throw new HttpError(
								'Project directory is outside configured application roots',
								400
							);
						}
						launches.push(input);
						return demoSession;
					},
				},
			} as unknown as WebContext)
		);

		const missingIntent = await app.handle(
			new Request('http://localhost/api/v1/skills/demo/run', {
				body: JSON.stringify({ projectDir: 'D:/applications/aidd' }),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			})
		);
		expect(missingIntent.status).toBe(400);
		expect(await missingIntent.json()).toEqual({
			error: 'executionIntent must be either "review-only" or "apply-changes"',
		});

		const malformedJson = await app.handle(
			new Request('http://localhost/api/v1/skills/demo/run', {
				body: '{',
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			})
		);
		expect(malformedJson.status).toBe(400);
		expect(await malformedJson.json()).toEqual({ error: 'Request body must be valid JSON' });

		const unknownSkill = await app.handle(
			new Request('http://localhost/api/v1/skills/missing/run', {
				body: JSON.stringify({
					executionIntent: 'review-only',
					projectDir: 'D:/applications/aidd',
				}),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			})
		);
		expect(unknownSkill.status).toBe(404);
		expect(await unknownSkill.json()).toEqual({ error: 'Skill not found: missing' });

		const rejectedProject = await app.handle(
			new Request('http://localhost/api/v1/skills/demo/run', {
				body: JSON.stringify({
					executionIntent: 'review-only',
					projectDir: 'D:/outside-allowed-root',
				}),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			})
		);
		expect(rejectedProject.status).toBe(400);
		expect(await rejectedProject.json()).toEqual({
			error: 'Project directory is outside configured application roots',
		});

		const invalidIntentType = await app.handle(
			new Request('http://localhost/api/v1/skills/demo/run', {
				body: JSON.stringify({ executionIntent: 1, projectDir: 'D:/applications/aidd' }),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			})
		);
		expect(invalidIntentType.status).toBe(400);
		expect(await invalidIntentType.json()).toEqual({ error: 'Request validation failed' });

		const notFound = await app.handle(new Request('http://localhost/api/v1/skills/demo/other'));
		expect(notFound.status).toBe(404);
		expect(await notFound.json()).toEqual({ error: 'Not found' });
		expect(launches).toEqual([]);
	});

	test('returns explicit errors for missing and unsafe skill ids', async () => {
		const root = await testTempDir('aidd-web-skill-route-');
		try {
			await mkdir(join(root, 'skills'), { recursive: true });
			const skillService = new SkillService({ rootDir: root });
			const app = new Elysia()
				.use(errorHandlerPlugin)
				.use(createSkillsRoutes({ skillService } as unknown as WebContext));

			const missing = await app.handle(
				new Request('http://localhost/api/v1/skills/missing-skill')
			);
			expect(missing.status).toBe(404);
			expect(await missing.json()).toEqual({
				error: 'Skill not found: missing-skill',
			});

			const unsafe = await app.handle(new Request('http://localhost/api/v1/skills/Bad'));
			expect(unsafe.status).toBe(400);
			expect(await unsafe.json()).toEqual({ error: 'Invalid skill id: Bad' });
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});
