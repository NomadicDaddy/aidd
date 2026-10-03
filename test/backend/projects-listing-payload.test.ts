import { describe, expect, test } from 'bun:test';

import type { ProjectService } from '../../backend/src/services/projectService.ts';

import { listProjectsWithoutFeatureStatus } from '../../backend/src/routes/projectsListing.ts';

// GET /api/v1/projects backs the Projects page and the profile matrix, which never read a
// project's run or iteration history. On a 63-project fleet that history was 76% of a 1.2 MB
// response and the page's largest paint took 9 s, so the listing leaves it to the detail endpoint.
describe('the projects listing', () => {
	const history = {
		localIterations: [{ iteration: 1 }],
		localRuns: [{ runId: 'run_1' }],
	};
	const service = {
		listProjects: async () => ({
			initFailures: [],
			projects: [
				{
					featureStatus: [{ id: 'f1' }],
					id: 'p1',
					metadata: { ...history, maturity: 'beta', usage: { totals: {} } },
					name: 'one',
				},
			],
			skippedRoots: [],
			spernakitTemplateVersion: null,
		}),
	} as unknown as ProjectService;

	test('omits feature status and run history and keeps every other field', async () => {
		const listing = await listProjectsWithoutFeatureStatus(service);
		const [project]: unknown[] = listing.projects;
		expect(project).toEqual({
			id: 'p1',
			metadata: { maturity: 'beta', usage: { totals: {} } },
			name: 'one',
		});
		expect(listing.initFailures).toEqual([]);
		expect(listing.spernakitTemplateVersion).toBeNull();
	});

	test('does not alter the service result it was given', async () => {
		const listing = await service.listProjects();
		await listProjectsWithoutFeatureStatus({ listProjects: async () => listing } as never);
		expect(listing.projects[0]?.metadata).toMatchObject(history);
	});
});
