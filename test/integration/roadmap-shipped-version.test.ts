import type { Feature } from 'aidd-shared/metadata/features';

import { describe, expect, test } from 'bun:test';
import { roadmapSchema } from 'aidd-shared/metadata/roadmap';
import {
	milestoneForShippedVersion,
	planMilestoneReassign,
	reconcileShippedPlacement,
} from 'aidd-shared/metadata/roadmap-milestones';

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

describe('milestoneForShippedVersion', () => {
	const roadmap = roadmapSchema.parse({ features: {}, milestones: THREE_MILESTONES });

	test('a shipped version maps to the greatest version-named bound at or below it', () => {
		expect(milestoneForShippedVersion(roadmap, '1.0.0')).toBe('v1.0');
		expect(milestoneForShippedVersion(roadmap, '1.4.1')).toBe('v1.0');
		expect(milestoneForShippedVersion(roadmap, '1.999.3')).toBe('v1.0');
	});

	test('the last version-named milestone is open-ended upward', () => {
		expect(milestoneForShippedVersion(roadmap, '2.0.0')).toBe('v2.0');
		expect(milestoneForShippedVersion(roadmap, '3.2.1')).toBe('v2.0');
	});

	test('below every bound falls into the first milestone, whatever its name', () => {
		expect(milestoneForShippedVersion(roadmap, '0.9.0')).toBe('MVP');
	});

	test('a leading v and prerelease/build suffixes are tolerated', () => {
		expect(milestoneForShippedVersion(roadmap, 'v1.2.0')).toBe('v1.0');
		expect(milestoneForShippedVersion(roadmap, '2.1.0-rc.1')).toBe('v2.0');
	});

	test('non-version milestone names are skipped as bounds but still catch pre-1.0 work', () => {
		const named = roadmapSchema.parse({
			features: {},
			milestones: {
				Foundation: { priority: 1 },
				Hardening: { priority: 3 },
				'v1.0': { priority: 2 },
			},
		});
		expect(milestoneForShippedVersion(named, '1.1.0')).toBe('v1.0');
		expect(milestoneForShippedVersion(named, '0.5.0')).toBe('Foundation');
	});

	test('no version-named milestones at all means no opinion', () => {
		const unnamed = roadmapSchema.parse({
			features: {},
			milestones: { Later: { priority: 2 }, Soon: { priority: 1 } },
		});
		expect(milestoneForShippedVersion(unnamed, '1.4.1')).toBeNull();
	});

	test('an unparseable shipped version means no opinion', () => {
		expect(milestoneForShippedVersion(roadmap, 'not-a-version')).toBeNull();
		expect(milestoneForShippedVersion(roadmap, '')).toBeNull();
	});
});

describe('reconcileShippedPlacement', () => {
	const roadmap = roadmapSchema.parse({
		features: {
			done: { milestone: 'v2.0' },
			open: { milestone: 'v2.0' },
			settled: { milestone: 'v1.0' },
			unstamped: { milestone: 'v2.0' },
		},
		milestones: THREE_MILESTONES,
	});

	test('a completed feature moves to the milestone matching its shipped version', () => {
		const { backfills, seedMoves } = reconcileShippedPlacement(
			roadmap,
			[completed('done', { shippedVersion: '1.3.0' })],
			null,
		);
		expect(seedMoves).toEqual([
			{ featureDirectory: 'done', from: 'v2.0', reason: 'shipped-version', to: 'v1.0' },
		]);
		expect(backfills).toEqual([]);
	});

	test('incomplete features are never touched, even with a shipped version', () => {
		const { backfills, seedMoves } = reconcileShippedPlacement(
			roadmap,
			[feature('open', { shippedVersion: '1.3.0', status: 'in_progress' })],
			'1.4.1',
		);
		expect(seedMoves).toEqual([]);
		expect(backfills).toEqual([]);
	});

	test('a completed feature with no shipped version is placed and backfilled from the app version', () => {
		const { backfills, seedMoves } = reconcileShippedPlacement(
			roadmap,
			[completed('unstamped')],
			'1.4.1',
		);
		expect(backfills).toEqual([{ featureDirectory: 'unstamped', shippedVersion: '1.4.1' }]);
		expect(seedMoves).toEqual([
			{ featureDirectory: 'unstamped', from: 'v2.0', reason: 'shipped-version', to: 'v1.0' },
		]);
	});

	test('already in the right milestone still backfills, but plans no move', () => {
		const { backfills, seedMoves } = reconcileShippedPlacement(
			roadmap,
			[completed('settled')],
			'1.4.1',
		);
		expect(backfills).toEqual([{ featureDirectory: 'settled', shippedVersion: '1.4.1' }]);
		expect(seedMoves).toEqual([]);
	});

	test('neither shipped version nor app version means the feature is left alone', () => {
		const { backfills, seedMoves } = reconcileShippedPlacement(
			roadmap,
			[completed('unstamped')],
			null,
		);
		expect(seedMoves).toEqual([]);
		expect(backfills).toEqual([]);
	});

	test('never moves a feature forward out of an earlier milestone', () => {
		// shippedVersion records the latest revision, not original delivery: an MVP feature
		// revised in 1.4 still belongs to MVP.
		const mvpMapped = roadmapSchema.parse({
			features: { original: { milestone: 'MVP' } },
			milestones: THREE_MILESTONES,
		});
		const { seedMoves } = reconcileShippedPlacement(
			mvpMapped,
			[completed('original', { shippedVersion: '1.4.0' })],
			null,
		);
		expect(seedMoves).toEqual([]);
	});

	test('a mapping pointing at no known milestone is still seeded by version', () => {
		const broken = roadmapSchema.parse({
			features: { orphan: { milestone: 'deleted-long-ago' } },
			milestones: THREE_MILESTONES,
		});
		const { seedMoves } = reconcileShippedPlacement(
			broken,
			[completed('orphan', { shippedVersion: '1.3.0' })],
			null,
		);
		expect(seedMoves).toEqual([
			{
				featureDirectory: 'orphan',
				from: 'deleted-long-ago',
				reason: 'shipped-version',
				to: 'v1.0',
			},
		]);
	});

	test('an unparseable app version is never stamped', () => {
		const { backfills, seedMoves } = reconcileShippedPlacement(
			roadmap,
			[completed('unstamped')],
			'not-a-version',
		);
		expect(seedMoves).toEqual([]);
		expect(backfills).toEqual([]);
	});
});

describe('planMilestoneReassign with an app version', () => {
	test('re-homes completed features and carries the backfills on the plan', () => {
		const roadmap = roadmapSchema.parse({
			features: {
				'audit-x-1': { milestone: 'v2.0' },
				shipped: { milestone: 'v2.0' },
			},
			milestones: THREE_MILESTONES,
		});
		const plan = planMilestoneReassign(
			roadmap,
			[
				completed('audit-x-1', { auditSource: 'audit-x' }),
				completed('shipped', { shippedVersion: '1.3.0' }),
			],
			{ appVersion: '1.4.1' },
		);
		expect(plan.moves).toEqual([
			{ featureDirectory: 'audit-x-1', from: 'v2.0', reason: 'shipped-version', to: 'v1.0' },
			{ featureDirectory: 'shipped', from: 'v2.0', reason: 'shipped-version', to: 'v1.0' },
		]);
		expect(plan.backfills).toEqual([
			{ featureDirectory: 'audit-x-1', shippedVersion: '1.4.1' },
		]);
		expect(plan.roadmap.features.shipped?.milestone).toBe('v1.0');
	});

	test('without an app version the plan has no backfills', () => {
		const roadmap = roadmapSchema.parse({
			features: { shipped: { milestone: 'v2.0' } },
			milestones: THREE_MILESTONES,
		});
		const plan = planMilestoneReassign(roadmap, [
			completed('shipped', { shippedVersion: '1.3.0' }),
		]);
		expect(plan.backfills).toEqual([]);
		expect(plan.moves).toEqual([
			{ featureDirectory: 'shipped', from: 'v2.0', reason: 'shipped-version', to: 'v1.0' },
		]);
	});

	test('incomplete features are still never pulled earlier', () => {
		const roadmap = roadmapSchema.parse({
			features: { open: { milestone: 'v2.0' } },
			milestones: THREE_MILESTONES,
		});
		const plan = planMilestoneReassign(roadmap, [feature('open')], { appVersion: '1.4.1' });
		expect(plan.moves).toEqual([]);
		expect(plan.roadmap.features.open?.milestone).toBe('v2.0');
	});

	test('a dependency in a later milestone still wins over the shipped-version seed', () => {
		const roadmap = roadmapSchema.parse({
			features: { dep: { milestone: 'v2.0' }, done: { milestone: 'v2.0' } },
			milestones: THREE_MILESTONES,
		});
		const plan = planMilestoneReassign(
			roadmap,
			[completed('done', { dependencies: ['dep'], shippedVersion: '1.3.0' }), feature('dep')],
			{},
		);
		// The seed wanted v1.0, but the dependency pass pushes it back — no net move.
		expect(plan.moves).toEqual([]);
		expect(plan.roadmap.features.done?.milestone).toBe('v2.0');
	});

	test('a shipped-version move re-syncs the feature priority to its new milestone', () => {
		const roadmap = roadmapSchema.parse({
			features: { shipped: { milestone: 'v2.0' } },
			milestones: THREE_MILESTONES,
		});
		const plan = planMilestoneReassign(
			roadmap,
			[completed('shipped', { priority: 3, shippedVersion: '1.3.0' })],
			{},
		);
		expect(plan.priorityUpdates).toEqual([{ featureDirectory: 'shipped', from: 3, to: 2 }]);
	});
});
