import { describe, expect, test } from 'bun:test';
import {
	type Feature,
	isValidFeatureStatus,
	selectFeatureCandidates,
	summarizeFeatures,
} from 'aidd-shared/metadata/features';
import { evaluateRoadmapCodingGate, roadmapSchema } from 'aidd-shared/metadata/roadmap';

// `deferred` is scope the owner has set aside: the record is kept, but it is not work. These cases
// pin the three places that decide what counts as work.

function feature(id: string, overrides: Partial<Feature> = {}): Feature {
	return { id, passes: false, priority: 1, status: 'backlog', ...overrides };
}

describe('deferred feature status', () => {
	test('is part of the status vocabulary', () => {
		expect(isValidFeatureStatus('deferred')).toBe(true);
	});

	test('is never offered to a run, whatever its priority', () => {
		const features = [
			feature('set-aside', { priority: 1, status: 'deferred' }),
			feature('open-work', { priority: 3 }),
		];

		expect(selectFeatureCandidates(features).map((item) => item.id)).toEqual(['open-work']);
	});

	test('is counted under its own name and in no other count', () => {
		const stats = summarizeFeatures([
			feature('set-aside', { status: 'deferred' }),
			feature('also-set-aside', { dependencies: ['missing'], status: 'deferred' }),
			feature('open-work'),
			feature('parked', { status: 'waiting_approval' }),
			feature('done', { passes: true, status: 'completed' }),
		]);

		expect(stats).toMatchObject({
			deferred: 2,
			dependencyBlocked: 0,
			failing: 1,
			open: 2,
			passing: 1,
			total: 5,
			waitingApproval: 1,
		});
	});

	test('still blocks a feature that depends on it', () => {
		const features = [
			feature('set-aside', { status: 'deferred' }),
			feature('needs-it', { dependencies: ['set-aside'] }),
		];

		expect(selectFeatureCandidates(features)).toEqual([]);
		expect(summarizeFeatures(features).dependencyBlocked).toBe(1);
	});
});

describe('deferred features and the roadmap gate', () => {
	const roadmap = roadmapSchema.parse({
		features: {
			'earlier-done': { milestone: 'MVP' },
			'earlier-set-aside': { milestone: 'MVP' },
			'later-work': { milestone: 'v1.0' },
		},
		milestones: { MVP: { priority: 1 }, 'v1.0': { priority: 2 } },
	});

	test('a milestone whose only unfinished records are deferred does not hold the gate', () => {
		const gate = evaluateRoadmapCodingGate(roadmap, [
			feature('earlier-done', { passes: true, status: 'completed' }),
			feature('earlier-set-aside', { status: 'deferred' }),
			feature('later-work'),
		]);

		expect(gate.activeMilestone).toBe('v1.0');
		expect(gate.allowedFeatureDirectories).toEqual(['later-work']);
	});

	// The control: the same record as waiting_approval is exactly what stalls the gate, which is
	// why a parked status could not stand in for a deferred one.
	test('the same record waiting on approval does hold it', () => {
		const gate = evaluateRoadmapCodingGate(roadmap, [
			feature('earlier-done', { passes: true, status: 'completed' }),
			feature('earlier-set-aside', { status: 'waiting_approval' }),
			feature('later-work'),
		]);

		expect(gate.activeMilestone).toBe('MVP');
	});

	test('a roadmap with nothing left but deferred records has no active milestone', () => {
		const gate = evaluateRoadmapCodingGate(roadmap, [
			feature('earlier-done', { passes: true, status: 'completed' }),
			feature('earlier-set-aside', { status: 'deferred' }),
			feature('later-work', { status: 'deferred' }),
		]);

		expect(gate.activeMilestone).toBeNull();
	});
});
