import type { Feature } from 'aidd-shared/metadata/features';

import { describe, expect, test } from 'bun:test';
import { roadmapSchema } from 'aidd-shared/metadata/roadmap';
import {
	findCrossMilestoneViolations,
	planMilestoneCreate,
	planMilestoneDelete,
	planMilestoneReassign,
	planMilestoneUpdate,
} from 'aidd-shared/metadata/roadmap-milestones';

// Phillip #34088: a completed record's milestone is when it shipped. A dependency on later work
// does not move it; a dated note naming the dependency explains the edge, and without one the edge
// stays reported (completed-records-keep-their-shipped-milestone).

function feature(id: string, extra: Partial<Feature> = {}): Feature {
	return { id, status: 'backlog', ...extra };
}

function completed(id: string, extra: Partial<Feature> = {}): Feature {
	return feature(id, { passes: true, status: 'completed', ...extra });
}

const THREE_MILESTONES = {
	MVP: { description: 'core', priority: 1 },
	'v1.0': { description: 'release', priority: 2 },
	'v2.0': { description: 'later', priority: 3 },
};

function roadmap(features: Record<string, string>) {
	return roadmapSchema.parse({
		features: Object.fromEntries(
			Object.entries(features).map(([id, milestone]) => [id, { milestone }]),
		),
		milestones: THREE_MILESTONES,
	});
}

const NOTED = '2026-11-04: depends on late, whose remaining acceptance is v2.0 work.';

describe('placement keeps a completed feature where it shipped', () => {
	test('reassign leaves a completed feature put and still moves an unfinished one', () => {
		const plan = planMilestoneReassign(roadmap({ done: 'MVP', late: 'v2.0', open: 'MVP' }), [
			completed('done', { dependencies: ['late'] }),
			feature('open', { dependencies: ['late'] }),
			feature('late'),
		]);
		expect(plan.roadmap.features.done?.milestone).toBe('MVP');
		expect(plan.moves).toEqual([
			{ featureDirectory: 'open', from: 'MVP', reason: 'dependency', to: 'v2.0' },
		]);
	});

	test('a milestone edit elsewhere does not push a completed feature to its dependency', () => {
		// Every milestone operation re-runs placement; the old pass pushed `done` to v1.0 here.
		const plan = planMilestoneUpdate(
			roadmap({ done: 'MVP', late: 'v1.0' }),
			[completed('done', { dependencies: ['late'] }), feature('late')],
			'v2.0',
			{ description: 'renamed later work' },
		);
		expect(plan.roadmap.features.done?.milestone).toBe('MVP');
		expect(plan.moves).toEqual([]);
	});

	test('adding a milestone does not push a completed feature to its dependency', () => {
		const plan = planMilestoneCreate(
			roadmap({ done: 'MVP', late: 'v1.0' }),
			[completed('done', { dependencies: ['late'] }), feature('late')],
			'v3.0',
		);
		expect(plan.roadmap.features.done?.milestone).toBe('MVP');
		expect(plan.moves).toEqual([]);
	});

	test('a delete cascade does not push a completed dependent past its dependency', () => {
		const plan = planMilestoneDelete(
			roadmap({ done: 'MVP', late: 'v1.0' }),
			[completed('done', { dependencies: ['late'] }), feature('late')],
			'v1.0',
		);
		expect(plan.roadmap.features.late?.milestone).toBe('v2.0');
		expect(plan.roadmap.features.done?.milestone).toBe('MVP');
	});

	test('a feature that depends on a completed one is still placed after it', () => {
		const plan = planMilestoneReassign(roadmap({ done: 'v1.0', next: 'MVP' }), [
			completed('done'),
			feature('next', { dependencies: ['done'] }),
		]);
		expect(plan.roadmap.features.next?.milestone).toBe('v1.0');
	});
});

describe('the check requires a dated note on a completed feature’s later edge', () => {
	const later = roadmap({ done: 'MVP', late: 'v2.0', open: 'MVP' });

	function edges(done: Feature, open?: Feature): [string, boolean][] {
		const features = [done, feature('late'), ...(open ? [open] : [])];
		return findCrossMilestoneViolations(later, features).map((entry) => [
			entry.featureDirectory,
			entry.featurePasses,
		]);
	}

	test('a dated note naming the dependency explains the edge', () => {
		expect(edges(completed('done', { dependencies: ['late'], notes: [NOTED] }))).toEqual([]);
	});

	test('without a note, or with an undated one, the edge is reported as passing', () => {
		expect(edges(completed('done', { dependencies: ['late'] }))).toEqual([['done', true]]);
		const undated = 'Depends on late, whose acceptance is v2.0 work.';
		expect(edges(completed('done', { dependencies: ['late'], notes: [undated] }))).toEqual([
			['done', true],
		]);
	});

	test('a note naming only a longer id does not count', () => {
		const other = '2026-11-04: the latest revision is in latest-release.';
		expect(edges(completed('done', { dependencies: ['late'], notes: [other] }))).toEqual([
			['done', true],
		]);
	});

	test('an unfinished feature is reported even with a dated note', () => {
		const open = feature('open', { dependencies: ['late'], notes: [NOTED] });
		expect(edges(completed('done', { dependencies: ['late'], notes: [NOTED] }), open)).toEqual([
			['open', false],
		]);
	});

	test('a string note counts as well as an array of notes', () => {
		expect(edges(completed('done', { dependencies: ['late'], notes: NOTED }))).toEqual([]);
	});
});
