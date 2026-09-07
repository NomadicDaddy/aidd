import { describe, expect, test } from 'bun:test';

import type { ProjectFeature, ProjectRoadmapSummary } from '../../frontend/src/api/types.ts';

import {
	compareFeatures,
	DEFAULT_FEATURE_SORT,
	DEFAULT_FEATURE_SORT_DIR,
	FEATURE_SORT_COLUMNS,
	type FeatureSortKey,
	readFeatureSortDir,
	readFeatureSortKey,
} from '../../frontend/src/pages/projects/detail/features-list-sort.ts';

function makeFeature(id: string, fields: Record<string, unknown> = {}): ProjectFeature {
	return { id, status: 'backlog', title: id, ...fields } as unknown as ProjectFeature;
}

const roadmap = {
	milestoneOrder: ['MVP', 'M2', 'M10'],
	milestones: { M2: {}, M10: {}, MVP: {} },
} as unknown as ProjectRoadmapSummary;

/** The ids of `rows` after sorting them the way the tab does. */
function order(rows: ProjectFeature[], key: FeatureSortKey, dir: 'asc' | 'desc' = 'asc'): string[] {
	return [...rows]
		.sort((left, right) => compareFeatures(left, right, key, dir, roadmap))
		.map((feature) => feature.id as string);
}

describe('feature sort keys', () => {
	test('the column list is the single declaration of what this tab can order by', () => {
		expect(FEATURE_SORT_COLUMNS.map((column) => column.key)).toEqual([
			'title',
			'status',
			'shipped',
			'milestone',
			'priority',
			'source',
			'added',
			'completed',
		]);
		// Every column carries a label, because the same array feeds the mobile CardSortControl.
		for (const column of FEATURE_SORT_COLUMNS) expect(column.label.length).toBeGreaterThan(0);
	});

	test('unknown or absent URL values fall back to the defaults rather than an empty view', () => {
		expect(readFeatureSortKey(null)).toBe(DEFAULT_FEATURE_SORT);
		expect(readFeatureSortKey('')).toBe(DEFAULT_FEATURE_SORT);
		expect(readFeatureSortKey('nonsense')).toBe(DEFAULT_FEATURE_SORT);
		expect(readFeatureSortKey('completed')).toBe('completed');
		expect(readFeatureSortDir(null)).toBe(DEFAULT_FEATURE_SORT_DIR);
		expect(readFeatureSortDir('sideways')).toBe(DEFAULT_FEATURE_SORT_DIR);
		expect(readFeatureSortDir('desc')).toBe('desc');
	});

	test('the defaults are the ordering that shipped before sorting existed', () => {
		expect(DEFAULT_FEATURE_SORT).toBe('title');
		expect(DEFAULT_FEATURE_SORT_DIR).toBe('asc');
	});
});

describe('compareFeatures', () => {
	test('orders titles the way the untouched tab already did', () => {
		const rows = [makeFeature('c', { title: 'Charlie' }), makeFeature('a', { title: 'Alpha' })];
		expect(order(rows, 'title')).toEqual(['a', 'c']);
		expect(order(rows, 'title', 'desc')).toEqual(['c', 'a']);
	});

	test('orders status by lifecycle position, not alphabetically', () => {
		const rows = [
			makeFeature('d', { status: 'completed' }),
			makeFeature('b', { status: 'in_progress' }),
			makeFeature('a', { status: 'backlog' }),
			makeFeature('c', { status: 'waiting_approval' }),
		];
		expect(order(rows, 'status')).toEqual(['a', 'b', 'c', 'd']);
		expect(order(rows, 'status', 'desc')).toEqual(['d', 'c', 'b', 'a']);
	});

	test('sorts an unrecognised status last in both directions', () => {
		const rows = [makeFeature('bogus', { status: 'done' }), makeFeature('real')];
		expect(order(rows, 'status')).toEqual(['real', 'bogus']);
		expect(order(rows, 'status', 'desc')).toEqual(['real', 'bogus']);
	});

	test('orders milestones by roadmap position so M2 precedes M10', () => {
		const rows = [
			makeFeature('c', { milestone: 'M10' }),
			makeFeature('a', { milestone: 'MVP' }),
			makeFeature('b', { milestone: 'M2' }),
		];
		expect(order(rows, 'milestone')).toEqual(['a', 'b', 'c']);
	});

	test('ranks a milestone the roadmap does not declare after every one it does', () => {
		const rows = [
			makeFeature('off', { milestone: 'Someday' }),
			makeFeature('on', { milestone: 'M10' }),
		];
		expect(order(rows, 'milestone')).toEqual(['on', 'off']);
	});

	test('orders priority numerically and treats a non-numeric priority as unassigned', () => {
		const rows = [
			makeFeature('c', { priority: 10 }),
			makeFeature('a', { priority: 2 }),
			makeFeature('z', { priority: 'high' }),
		];
		expect(order(rows, 'priority')).toEqual(['a', 'c', 'z']);
		expect(order(rows, 'priority', 'desc')).toEqual(['c', 'a', 'z']);
	});

	test('orders the two lifecycle instants chronologically', () => {
		const rows = [
			makeFeature('late', { createdAt: '2026-08-01T00:00:00.000Z' }),
			makeFeature('early', { createdAt: '2026-01-01T00:00:00.000Z' }),
		];
		expect(order(rows, 'added')).toEqual(['early', 'late']);
		expect(order(rows, 'added', 'desc')).toEqual(['late', 'early']);
	});

	test('reads completed through the same status guard the cell renders with', () => {
		const rows = [
			makeFeature('open', { status: 'in_progress', updatedAt: '2026-08-01T00:00:00.000Z' }),
			makeFeature('done', {
				completedAt: '2026-02-01T00:00:00.000Z',
				status: 'completed',
			}),
		];
		// The in-progress row has the later timestamp but no completion, so it sorts last either way.
		expect(order(rows, 'completed')).toEqual(['done', 'open']);
		expect(order(rows, 'completed', 'desc')).toEqual(['done', 'open']);
	});

	test('keeps missing values last in both directions for every nullable key', () => {
		for (const key of ['added', 'completed', 'shipped', 'priority', 'milestone'] as const) {
			const rows = [
				makeFeature('empty'),
				makeFeature('filled', {
					completedAt: '2026-02-01T00:00:00.000Z',
					createdAt: '2026-02-01T00:00:00.000Z',
					milestone: 'MVP',
					priority: 1,
					shippedVersion: '2.0.0',
					status: 'completed',
				}),
			];
			expect(order(rows, key)).toEqual(['filled', 'empty']);
			expect(order(rows, key, 'desc')).toEqual(['filled', 'empty']);
		}
	});

	test('breaks ties on title, and holds that tiebreaker ascending under a descending sort', () => {
		const rows = [
			makeFeature('b', { status: 'backlog', title: 'Beta' }),
			makeFeature('a', { status: 'backlog', title: 'Alpha' }),
			makeFeature('z', { status: 'completed', title: 'Zulu' }),
		];
		expect(order(rows, 'status')).toEqual(['a', 'b', 'z']);
		// The status groups reverse; the alphabet inside a group does not.
		expect(order(rows, 'status', 'desc')).toEqual(['z', 'a', 'b']);
	});

	test('is a total order — no two distinct rows compare equal', () => {
		const rows = [makeFeature('a'), makeFeature('b')];
		for (const column of FEATURE_SORT_COLUMNS) {
			expect(compareFeatures(rows[0]!, rows[1]!, column.key, 'asc', roadmap)).not.toBe(0);
		}
	});
});
