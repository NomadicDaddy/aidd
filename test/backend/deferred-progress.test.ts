import { describe, expect, test } from 'bun:test';
import { type Feature, summarizeFeatures } from 'aidd-shared/metadata/features';
import { roadmapSchema } from 'aidd-shared/metadata/roadmap';
import { FileAiddStore } from 'aidd-shared/metadata/store';

import { toWebFeatureStats } from '../../backend/src/services/project/listings/featureMappers.ts';
import { buildMilestonesView } from '../../backend/src/services/project/milestonesView.ts';
import { gatherRoadmap } from '../../backend/src/services/projectMetadata/versionHelpers.ts';
import { testTempDir } from '../_helpers/temp.ts';

// A deferred record is kept scope, not planned work. Progress is measured against what is planned,
// so deferred records are out of every denominator the panel shows and are counted beside it. The
// three functions here are where those denominators come from.

const features: Feature[] = [
	{ id: 'built', passes: true, status: 'completed' },
	{ id: 'open-work', passes: false, status: 'backlog' },
	{ id: 'set-aside', passes: false, status: 'deferred' },
	{ id: 'only-deferred', passes: false, status: 'deferred' },
];
const roadmap = roadmapSchema.parse({
	features: {
		built: { milestone: 'MVP' },
		'only-deferred': { milestone: 'v1.1' },
		'open-work': { milestone: 'MVP' },
		'set-aside': { milestone: 'MVP' },
	},
	milestones: { MVP: { priority: 1 }, 'v1.1': { priority: 2 } },
});

describe('deferred records and progress figures', () => {
	test('the project total is planned work, with deferred counted beside it', () => {
		const stats = toWebFeatureStats(summarizeFeatures(features));

		// One of two planned features passes: 50 percent, not one of four.
		expect(stats).toMatchObject({ deferred: 2, passing: 1, total: 2 });
	});

	test('a milestone fraction leaves its deferred members out and still lists them', () => {
		const view = buildMilestonesView(roadmap, features);
		const byName = new Map(view.milestones.map((milestone) => [milestone.name, milestone]));

		expect(byName.get('MVP')).toMatchObject({ completed: 1, deferred: 1, total: 2 });
		expect(byName.get('MVP')?.featureDirectories).toEqual(['built', 'open-work', 'set-aside']);
		// Its only record is deferred: nothing planned, so 0 of 0 and not 0 of 1.
		expect(byName.get('v1.1')).toMatchObject({ completed: 0, deferred: 1, total: 0 });
		expect(byName.get('v1.1')?.featureDirectories).toEqual(['only-deferred']);
	});

	test('the roadmap summary uses the same fractions and the same current milestone', async () => {
		const store = new FileAiddStore(await testTempDir('aidd-deferred-progress-'));
		await store.writeRoadmap(roadmap);

		const summary = await gatherRoadmap(store, features);

		expect(summary?.milestones).toEqual({
			MVP: { completed: 1, deferred: 1, total: 2 },
			'v1.1': { completed: 0, deferred: 1, total: 0 },
		});
		expect(summary?.currentMilestone).toBe('MVP');
	});

	// The control: with the planned work in MVP finished, the deferred record there must not keep
	// MVP reading as the current milestone.
	test('a milestone with only deferred work left is not the current one', async () => {
		const store = new FileAiddStore(await testTempDir('aidd-deferred-progress-done-'));
		await store.writeRoadmap(roadmap);
		const finished = features.map((feature) =>
			feature.id === 'open-work'
				? { ...feature, passes: true, status: 'completed' }
				: feature,
		);

		const summary = await gatherRoadmap(store, finished);

		expect(summary?.milestones.MVP).toEqual({ completed: 2, deferred: 1, total: 2 });
		expect(summary?.currentMilestone).not.toBe('MVP');
	});
});
