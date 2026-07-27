import { describe, expect, test } from 'bun:test';

import type { MilestoneMove, ProjectMilestonePlan } from '../../frontend/src/api/types.ts';

import {
	groupMovesByTarget,
	milestonePlanNeedsReview,
	milestoneProgressLabel,
	milestoneRequestTitle,
	milestoneRequestVerb,
	moveReasonLabel,
	warningLabel,
} from '../../frontend/src/pages/projects/detail/milestonesUtils.ts';

function plan(overrides: Partial<ProjectMilestonePlan> = {}): ProjectMilestonePlan {
	return {
		applied: false,
		moves: [],
		priorityUpdates: [],
		view: {
			activeMilestone: 'MVP',
			gateBlocked: false,
			lifecycle: 'active',
			milestones: [],
			unmappedFeatureDirectories: [],
			violations: [],
		},
		violations: [],
		warnings: [],
		...overrides,
	};
}

function move(featureDirectory: string, to: string): MilestoneMove {
	return { featureDirectory, from: 'MVP', reason: 'dependency', to };
}

describe('milestonePlanNeedsReview', () => {
	test('a delete always stops for confirmation, even when nothing moves', () => {
		expect(milestonePlanNeedsReview(plan(), { input: {}, kind: 'delete', name: 'v1.0' })).toBe(
			true,
		);
	});

	test('a plain reorder applies in one click', () => {
		expect(
			milestonePlanNeedsReview(
				plan({ priorityUpdates: [{ featureDirectory: 'a', from: 1, to: 2 }] }),
				{
					input: { position: 2 },
					kind: 'update',
					name: 'MVP',
				},
			),
		).toBe(false);
	});

	test('anything that moves a feature stops', () => {
		expect(
			milestonePlanNeedsReview(plan({ moves: [move('alpha', 'v1.0')] }), {
				kind: 'reassign',
			}),
		).toBe(true);
	});

	test('warnings and leftover violations stop even with no moves', () => {
		const warned = plan({
			warnings: [{ code: 'mvp_status_mismatch', detail: 'x', featureDirectory: 'alpha' }],
		});
		expect(milestonePlanNeedsReview(warned, { kind: 'reassign' })).toBe(true);
		const violating = plan({
			violations: [
				{
					dependency: 'beta',
					dependencyMilestone: 'v2.0',
					featureDirectory: 'alpha',
					milestone: 'MVP',
				},
			],
		});
		expect(milestonePlanNeedsReview(violating, { kind: 'reassign' })).toBe(true);
	});
});

describe('groupMovesByTarget', () => {
	test('groups by destination and sorts each group by directory', () => {
		expect(
			groupMovesByTarget([move('zeta', 'v1.0'), move('alpha', 'v2.0'), move('beta', 'v1.0')]),
		).toEqual([
			{
				milestone: 'v1.0',
				moves: [move('beta', 'v1.0'), move('zeta', 'v1.0')],
			},
			{ milestone: 'v2.0', moves: [move('alpha', 'v2.0')] },
		]);
	});

	test('no moves means no groups', () => {
		expect(groupMovesByTarget([])).toEqual([]);
	});
});

describe('request copy', () => {
	test('titles name the milestone the operator is acting on', () => {
		expect(milestoneRequestTitle({ input: { name: 'v3.0' }, kind: 'create' })).toBe(
			'Create milestone v3.0',
		);
		expect(milestoneRequestTitle({ input: {}, kind: 'delete', name: 'v1.0' })).toBe(
			'Delete milestone v1.0',
		);
		expect(milestoneRequestTitle({ kind: 'reassign' })).toBe('Auto-place features');
	});

	test('verbs read as a completed action in the settle toast', () => {
		expect(milestoneRequestVerb({ kind: 'reassign' })).toBe('reassigned');
		expect(milestoneRequestVerb({ input: {}, kind: 'update', name: 'MVP' })).toBe('updated');
	});

	test('every move reason and warning code has operator-facing copy', () => {
		for (const reason of ['delete-cascade', 'dependency', 'rename', 'unmapped'] as const) {
			expect(moveReasonLabel(reason)).not.toBe('');
		}
		for (const code of [
			'dangling_dependency',
			'dependency_cycle',
			'mvp_status_mismatch',
		] as const) {
			expect(warningLabel(code)).not.toBe('');
		}
	});
});

describe('milestoneProgressLabel', () => {
	test('an empty milestone says so rather than reading 0/0', () => {
		expect(milestoneProgressLabel(0, 0)).toBe('No features');
		expect(milestoneProgressLabel(2, 5)).toBe('2/5 passing');
	});
});
