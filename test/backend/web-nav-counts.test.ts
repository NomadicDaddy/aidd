import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import type { WebContext } from '../../backend/src/context.ts';

import { createNavCountsRoutes } from '../../backend/src/routes/navCounts.ts';
import { testTempDir } from '../_helpers/temp.ts';

/**
 * Lays down a catalog root whose `audits/` holds two selectable definitions and one reference
 * definition, which the audit runner never selects and the Audits page never lists.
 */
async function auditCatalog(): Promise<string> {
	const rootDir = await testTempDir('nav-counts-');
	const auditDir = join(rootDir, 'audits');
	await mkdir(auditDir, { recursive: true });
	await writeFile(join(auditDir, 'accessibility.md'), '# Accessibility\n');
	await writeFile(join(auditDir, 'performance.md'), '# Performance\n');
	await writeFile(join(auditDir, 'glossary.md'), "type: 'reference'\n");
	return rootDir;
}

describe('nav-counts route', () => {
	test('counts each catalog the way its page lists it', async () => {
		const listedStates: unknown[] = [];
		const rootDir = await auditCatalog();
		const app = createNavCountsRoutes({
			auditService: {},
			recipeService: { listRecipes: async () => [{ id: 'ship' }, { id: 'polish' }] },
			rootDir,
			scheduledTaskService: {
				list: async (states: unknown) => {
					listedStates.push(states);
					return [{ id: 'nightly' }];
				},
			},
			skillService: {
				listSkills: async () => [{ id: 'demo' }, { id: 'spirit' }, { id: 'tidy' }],
			},
		} as unknown as WebContext);

		const response = await app.handle(new Request('http://localhost/api/v1/nav-counts'));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			audits: 2,
			recipes: 2,
			scheduled: 1,
			skills: 3,
		});
		// The Scheduled page opens on its active filter, so the badge counts the same slice.
		expect(listedStates).toEqual([['active']]);
	});

	test('counts zero for a service the panel is running without', async () => {
		const app = createNavCountsRoutes({
			recipeService: { listRecipes: async () => [] },
			rootDir: await testTempDir('nav-counts-bare-'),
			skillService: { listSkills: async () => [] },
		} as unknown as WebContext);

		const response = await app.handle(new Request('http://localhost/api/v1/nav-counts'));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ audits: 0, recipes: 0, scheduled: 0, skills: 0 });
	});
});
