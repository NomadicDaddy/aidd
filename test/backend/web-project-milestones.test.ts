import { serializeRoadmap } from 'aidd-shared/metadata/roadmap';
import { afterEach, describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { WebContext } from '../../backend/src/context.ts';
import type { ProjectMilestonePlanDto } from '../../backend/src/types/project/milestones.ts';

import { errorHandlerPlugin } from '../../backend/src/plugins/errorHandler.ts';
import { createProjectMilestoneRoutes } from '../../backend/src/routes/projectMilestones.ts';
import { ProjectMilestoneService } from '../../backend/src/services/project/milestoneService.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

const BASE = 'http://127.0.0.1:3210/api/v1/projects/anything/milestones';
const tempRoots: string[] = [];

interface SeedFeature {
	dependencies?: string[];
	directory: string;
	id?: string;
	milestone: string;
	passes?: boolean;
	priority?: number;
	status?: string;
}

async function seedProject(features: SeedFeature[], milestones: string[]): Promise<string> {
	const dir = await testTempDir('aidd-milestones-');
	tempRoots.push(dir);
	const metadataDir = join(dir, '.aidd');
	// Default each feature's priority to its milestone's tier, i.e. no drift — the state a project
	// is in after roadmap:apply. Tests that want drift set `priority` explicitly, and the active-run
	// guard treats repairing drift as a feature.json write that has to wait for quiescence.
	const tier = (milestone: string) => milestones.indexOf(milestone) + 1;
	for (const feature of features) {
		await mkdir(join(metadataDir, 'features', feature.directory), { recursive: true });
		await writeFile(
			join(metadataDir, 'features', feature.directory, 'feature.json'),
			`${JSON.stringify(
				{
					id: feature.id ?? feature.directory,
					...(feature.dependencies ? { dependencies: feature.dependencies } : {}),
					passes: feature.passes ?? false,
					priority: feature.priority ?? tier(feature.milestone),
					status: feature.status ?? 'backlog',
					title: feature.directory,
				},
				null,
				2,
			)}\n`,
		);
	}
	await mkdir(metadataDir, { recursive: true });
	await writeFile(
		join(metadataDir, 'roadmap.json'),
		serializeRoadmap({
			features: Object.fromEntries(
				features.map((feature) => [feature.directory, { milestone: feature.milestone }]),
			),
			milestones: Object.fromEntries(
				milestones.map((name, index) => [name, { priority: index + 1 }]),
			),
		}),
	);
	return dir;
}

function createApp(projectDir: string, activeRuns = false) {
	const context = {
		projectService: {
			milestones: new ProjectMilestoneService(() => Promise.resolve(projectDir)),
		},
		runService: { hasActiveRunForProject: () => Promise.resolve(activeRuns) },
	} as unknown as WebContext;
	return new Elysia().use(errorHandlerPlugin).use(createProjectMilestoneRoutes(context));
}

function send(app: ReturnType<typeof createApp>, method: string, path: string, body?: unknown) {
	return app.handle(
		new Request(`${BASE}${path}`, {
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
			headers: { 'content-type': 'application/json' },
			method,
		}),
	);
}

async function readRoadmapFile(dir: string): Promise<string> {
	return readFile(join(dir, '.aidd', 'roadmap.json'), 'utf8');
}

async function readPriority(dir: string, directory: string): Promise<number | undefined> {
	const raw = await readFile(join(dir, '.aidd', 'features', directory, 'feature.json'), 'utf8');
	return (JSON.parse(raw) as { priority?: number }).priority;
}

afterEach(async () => {
	while (tempRoots.length > 0) {
		const dir = tempRoots.pop();
		if (dir) await removeTempTree(dir);
	}
});

describe('GET /:id/milestones', () => {
	test('returns milestones in priority order with counts and the active milestone', async () => {
		const dir = await seedProject(
			[
				{ directory: 'alpha', milestone: 'MVP', passes: true },
				{ directory: 'beta', milestone: 'v1.0' },
			],
			['MVP', 'v1.0'],
		);
		const response = await send(createApp(dir), 'GET', '');
		expect(response.status).toBe(200);
		const view = (await response.json()) as {
			activeMilestone: string;
			gateBlocked: boolean;
			milestones: { completed: number; name: string; total: number }[];
		};
		expect(view.milestones.map((entry) => entry.name)).toEqual(['MVP', 'v1.0']);
		expect(view.milestones[0]).toMatchObject({ completed: 1, total: 1 });
		expect(view.activeMilestone).toBe('v1.0');
		expect(view.gateBlocked).toBe(false);
	});

	test('reports cross-milestone dependency violations', async () => {
		const dir = await seedProject(
			[
				{ dependencies: ['beta'], directory: 'alpha', milestone: 'MVP' },
				{ directory: 'beta', milestone: 'v1.0' },
			],
			['MVP', 'v1.0'],
		);
		const view = (await (await send(createApp(dir), 'GET', '')).json()) as {
			violations: {
				dependency: string;
				dependencyMilestone: string;
				featureDirectory: string;
				milestone: string;
			}[];
		};
		expect(view.violations).toEqual([
			{
				dependency: 'beta',
				dependencyMilestone: 'v1.0',
				featureDirectory: 'alpha',
				milestone: 'MVP',
			},
		]);
	});

	test('409s when the project has no roadmap.json', async () => {
		const dir = await testTempDir('aidd-milestones-');
		tempRoots.push(dir);
		const response = await send(createApp(dir), 'GET', '');
		expect(response.status).toBe(409);
	});
});

describe('POST /:id/milestones', () => {
	test('dry run reports the plan and writes nothing', async () => {
		const dir = await seedProject([{ directory: 'alpha', milestone: 'MVP' }], ['MVP']);
		const before = await readRoadmapFile(dir);
		const response = await send(createApp(dir), 'POST', '', {
			description: 'hardening pass',
			dryRun: true,
			name: 'v1.0',
		});
		expect(response.status).toBe(200);
		const plan = (await response.json()) as ProjectMilestonePlanDto;
		expect(plan.applied).toBe(false);
		expect(plan.view.milestones.map((entry) => entry.name)).toEqual(['MVP', 'v1.0']);
		expect(await readRoadmapFile(dir)).toBe(before);
	});

	test('apply writes roadmap.json in serializeRoadmap form', async () => {
		const dir = await seedProject([{ directory: 'alpha', milestone: 'MVP' }], ['MVP']);
		const response = await send(createApp(dir), 'POST', '', { name: 'v1.0' });
		expect(response.status).toBe(200);
		expect(((await response.json()) as ProjectMilestonePlanDto).applied).toBe(true);
		const onDisk = await readRoadmapFile(dir);
		const parsed = JSON.parse(onDisk) as {
			milestones: Record<string, { priority: number }>;
		};
		expect(parsed.milestones['v1.0']?.priority).toBe(2);
		// The store never JSON.stringifies roadmap.json; a drift here means the canonical
		// prettier form was lost and every later write would rewrite the whole file.
		expect(onDisk).toBe(
			serializeRoadmap(JSON.parse(onDisk) as Parameters<typeof serializeRoadmap>[0]),
		);
	});

	test('inserting a milestone renumbers feature priorities on disk', async () => {
		const dir = await seedProject(
			[{ directory: 'alpha', milestone: 'v1.0', priority: 1 }],
			['v1.0'],
		);
		const response = await send(createApp(dir), 'POST', '', { name: 'MVP', position: 1 });
		expect(response.status).toBe(200);
		const plan = (await response.json()) as ProjectMilestonePlanDto;
		expect(plan.priorityUpdates).toEqual([{ featureDirectory: 'alpha', from: 1, to: 2 }]);
		expect(await readPriority(dir, 'alpha')).toBe(2);
	});

	test('rejects a duplicate name', async () => {
		const dir = await seedProject([{ directory: 'alpha', milestone: 'MVP' }], ['MVP']);
		const response = await send(createApp(dir), 'POST', '', { name: 'MVP' });
		expect(response.status).toBe(400);
	});

	test('rejects a body without a name', async () => {
		const dir = await seedProject([{ directory: 'alpha', milestone: 'MVP' }], ['MVP']);
		const response = await send(createApp(dir), 'POST', '', { position: 1 });
		expect(response.status).toBe(400);
	});

	test('appending is allowed while a run is active', async () => {
		const dir = await seedProject([{ directory: 'alpha', milestone: 'MVP' }], ['MVP']);
		const response = await send(createApp(dir, true), 'POST', '', { name: 'v1.0' });
		expect(response.status).toBe(200);
	});
});

describe('PATCH /:id/milestones/:name', () => {
	test('renaming moves every mapped feature and rewrites the milestone key', async () => {
		const dir = await seedProject(
			[
				{ directory: 'alpha', milestone: 'MVP' },
				{ directory: 'beta', milestone: 'MVP' },
			],
			['MVP', 'v1.0'],
		);
		const response = await send(createApp(dir), 'PATCH', '/MVP', { name: 'foundation' });
		expect(response.status).toBe(200);
		const plan = (await response.json()) as ProjectMilestonePlanDto;
		expect(plan.moves.map((move) => move.featureDirectory)).toEqual(['alpha', 'beta']);
		const parsed = JSON.parse(await readRoadmapFile(dir)) as {
			features: Record<string, { milestone: string }>;
			milestones: Record<string, unknown>;
		};
		expect(parsed.milestones.MVP).toBeUndefined();
		expect(parsed.features.alpha?.milestone).toBe('foundation');
	});

	test('decodes a percent-encoded milestone name', async () => {
		const dir = await seedProject(
			[{ directory: 'alpha', milestone: 'first pass' }],
			['first pass'],
		);
		const response = await send(createApp(dir), 'PATCH', '/first%20pass', {
			description: 'kickoff',
		});
		expect(response.status).toBe(200);
		const parsed = JSON.parse(await readRoadmapFile(dir)) as {
			milestones: Record<string, { description?: string }>;
		};
		expect(parsed.milestones['first pass']?.description).toBe('kickoff');
	});

	test('404s for an unknown milestone', async () => {
		const dir = await seedProject([{ directory: 'alpha', milestone: 'MVP' }], ['MVP']);
		const response = await send(createApp(dir), 'PATCH', '/nope', { description: 'x' });
		expect(response.status).toBe(404);
	});

	test('a description-only edit is allowed while a run is active', async () => {
		const dir = await seedProject([{ directory: 'alpha', milestone: 'MVP' }], ['MVP']);
		const response = await send(createApp(dir, true), 'PATCH', '/MVP', { description: 'x' });
		expect(response.status).toBe(200);
	});

	test('409s on a reorder while a run is active', async () => {
		const dir = await seedProject([{ directory: 'alpha', milestone: 'MVP' }], ['MVP', 'v1.0']);
		const response = await send(createApp(dir, true), 'PATCH', '/MVP', { position: 2 });
		expect(response.status).toBe(409);
	});
});

describe('DELETE /:id/milestones/:name', () => {
	test('cascades features into the next milestone and drops the key', async () => {
		const dir = await seedProject(
			[
				{ directory: 'alpha', milestone: 'MVP' },
				{ directory: 'beta', milestone: 'v1.0' },
			],
			['MVP', 'v1.0'],
		);
		const response = await send(createApp(dir), 'DELETE', '/MVP', {});
		expect(response.status).toBe(200);
		const plan = (await response.json()) as ProjectMilestonePlanDto;
		expect(plan.moves).toEqual([
			{ featureDirectory: 'alpha', from: 'MVP', reason: 'delete-cascade', to: 'v1.0' },
		]);
		const parsed = JSON.parse(await readRoadmapFile(dir)) as {
			features: Record<string, { milestone: string }>;
			milestones: Record<string, unknown>;
		};
		expect(parsed.milestones.MVP).toBeUndefined();
		expect(parsed.features.alpha?.milestone).toBe('v1.0');
	});

	test('dry run leaves the milestone in place', async () => {
		const dir = await seedProject([{ directory: 'alpha', milestone: 'MVP' }], ['MVP', 'v1.0']);
		const before = await readRoadmapFile(dir);
		const response = await send(createApp(dir), 'DELETE', '/MVP', { dryRun: true });
		expect(((await response.json()) as ProjectMilestonePlanDto).applied).toBe(false);
		expect(await readRoadmapFile(dir)).toBe(before);
	});

	test('409s when it is the only milestone', async () => {
		const dir = await seedProject([{ directory: 'alpha', milestone: 'MVP' }], ['MVP']);
		const response = await send(createApp(dir), 'DELETE', '/MVP', {});
		expect(response.status).toBe(409);
	});

	test('rejects an unknown destination', async () => {
		const dir = await seedProject([{ directory: 'alpha', milestone: 'MVP' }], ['MVP', 'v1.0']);
		const response = await send(createApp(dir), 'DELETE', '/MVP', {
			targetMilestone: 'nope',
		});
		expect(response.status).toBe(400);
	});
});

describe('POST /:id/milestones/reassign', () => {
	test('pushes a dependent past its dependency and repairs the mapping on disk', async () => {
		const dir = await seedProject(
			[
				{ dependencies: ['beta'], directory: 'alpha', milestone: 'MVP' },
				{ directory: 'beta', milestone: 'v1.0' },
			],
			['MVP', 'v1.0'],
		);
		const response = await send(createApp(dir), 'POST', '/reassign', {});
		expect(response.status).toBe(200);
		const plan = (await response.json()) as ProjectMilestonePlanDto;
		expect(plan.moves).toEqual([
			{ featureDirectory: 'alpha', from: 'MVP', reason: 'dependency', to: 'v1.0' },
		]);
		expect(plan.view.violations).toEqual([]);
		const parsed = JSON.parse(await readRoadmapFile(dir)) as {
			features: Record<string, { milestone: string }>;
		};
		expect(parsed.features.alpha?.milestone).toBe('v1.0');
	});

	test('409s while a run is active because it moves features', async () => {
		const dir = await seedProject(
			[
				{ dependencies: ['beta'], directory: 'alpha', milestone: 'MVP' },
				{ directory: 'beta', milestone: 'v1.0' },
			],
			['MVP', 'v1.0'],
		);
		const response = await send(createApp(dir, true), 'POST', '/reassign', {});
		expect(response.status).toBe(409);
	});
});

describe('milestone name identity', () => {
	// Elysia percent-decodes path params itself. Decoding a second time in the route made a name
	// containing a literal `%` resolve to a different milestone, so an edit or delete could land on
	// the wrong one.
	test('a name containing a literal % targets that exact milestone', async () => {
		const dir = await seedProject(
			[{ directory: 'alpha', milestone: '100%25' }],
			['100%25', 'later'],
		);
		const response = await send(createApp(dir), 'PATCH', `/${encodeURIComponent('100%25')}`, {
			description: 'still the same milestone',
		});
		expect(response.status).toBe(200);
		const parsed = JSON.parse(await readRoadmapFile(dir)) as {
			milestones: Record<string, { description?: string }>;
		};
		expect(Object.keys(parsed.milestones)).toEqual(['100%25', 'later']);
		expect(parsed.milestones['100%25']?.description).toBe('still the same milestone');
	});

	test('404s for a name that only matches after a second decode', async () => {
		const dir = await seedProject(
			[{ directory: 'alpha', milestone: '100%' }],
			['100%', 'later'],
		);
		const response = await send(
			createApp(dir),
			'DELETE',
			`/${encodeURIComponent('100%25')}`,
			{},
		);
		expect(response.status).toBe(404);
	});

	test('rejects __proto__ as a new name instead of silently dropping the milestone', async () => {
		const dir = await seedProject([{ directory: 'alpha', milestone: 'MVP' }], ['MVP']);
		const response = await send(createApp(dir), 'POST', '', { name: '__proto__' });
		expect(response.status).toBe(400);
	});
});

describe('active-run guard covers feature.json writes', () => {
	// A description-only edit moves nothing, but it still settles priorityUpdates when the roadmap
	// carries pre-existing drift — and settling those rewrites feature.json under a running agent.
	test('409s when a description edit would repair priority drift mid-run', async () => {
		const dir = await seedProject(
			[{ directory: 'alpha', milestone: 'v1.0', priority: 1 }],
			['MVP', 'v1.0'],
		);
		const response = await send(createApp(dir, true), 'PATCH', '/v1.0', {
			description: 'harmless looking',
		});
		expect(response.status).toBe(409);
		expect(await readPriority(dir, 'alpha')).toBe(1);
	});

	test('a description edit with no drift still goes through mid-run', async () => {
		const dir = await seedProject(
			[{ directory: 'alpha', milestone: 'v1.0', priority: 2 }],
			['MVP', 'v1.0'],
		);
		const response = await send(createApp(dir, true), 'PATCH', '/v1.0', {
			description: 'harmless looking',
		});
		expect(response.status).toBe(200);
	});
});

describe('roadmap entries with no readable feature', () => {
	test('a rename carries an entry whose feature.json is unreadable', async () => {
		const dir = await seedProject([{ directory: 'alpha', milestone: 'MVP' }], ['MVP', 'v1.0']);
		await writeFile(
			join(dir, '.aidd', 'features', 'alpha', 'feature.json'),
			'{ not valid json',
		);
		const response = await send(createApp(dir), 'PATCH', '/MVP', { name: 'foundation' });
		expect(response.status).toBe(200);
		const parsed = JSON.parse(await readRoadmapFile(dir)) as {
			features: Record<string, { milestone: string }>;
			milestones: Record<string, unknown>;
		};
		// The entry follows the rename rather than being left pointing at a milestone that no longer
		// exists, which would set invalid_milestone_mapping and block every coding run.
		expect(parsed.features.alpha?.milestone).toBe('foundation');
		expect(Object.keys(parsed.milestones)).toEqual(['foundation', 'v1.0']);
	});
});
