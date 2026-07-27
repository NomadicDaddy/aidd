import type { Feature } from 'aidd-shared/metadata/features';

import { describe, expect, test } from 'bun:test';
import { roadmapSchema } from 'aidd-shared/metadata/roadmap';
import {
	findCrossMilestoneViolations,
	MilestoneOperationError,
	normalizeMilestonePriorities,
	planMilestoneCreate,
	planMilestoneDelete,
	planMilestoneReassign,
	planMilestoneUpdate,
} from 'aidd-shared/metadata/roadmap-milestones';

function feature(id: string, extra: Partial<Feature> = {}): Feature {
	return { id, status: 'backlog', ...extra };
}

const THREE_MILESTONES = {
	MVP: { description: 'core', priority: 1 },
	'v1.0': { description: 'release', priority: 2 },
	'v2.0': { description: 'later', priority: 3 },
};

describe('normalizeMilestonePriorities', () => {
	test('renumbers to a contiguous 1..N in priority order', () => {
		const roadmap = roadmapSchema.parse({
			features: {},
			milestones: { a: { priority: 10 }, b: { priority: 40 }, c: {} },
		});
		const normalized = normalizeMilestonePriorities(roadmap);
		expect(normalized.milestones.a?.priority).toBe(1);
		expect(normalized.milestones.b?.priority).toBe(2);
		// No priority sorts last via MAX_SAFE_INTEGER, and gains a real one here.
		expect(normalized.milestones.c?.priority).toBe(3);
	});
});

describe('findCrossMilestoneViolations', () => {
	test('reports a feature scheduled before its dependency', () => {
		const roadmap = roadmapSchema.parse({
			features: { early: { milestone: 'MVP' }, late: { milestone: 'v2.0' } },
			milestones: THREE_MILESTONES,
		});
		const violations = findCrossMilestoneViolations(roadmap, [
			feature('early', { dependencies: ['late'] }),
			feature('late'),
		]);
		expect(violations).toEqual([
			{
				dependency: 'late',
				dependencyMilestone: 'v2.0',
				featureDirectory: 'early',
				milestone: 'MVP',
			},
		]);
	});

	test('same or earlier dependency milestone is not a violation', () => {
		const roadmap = roadmapSchema.parse({
			features: { base: { milestone: 'MVP' }, later: { milestone: 'v2.0' } },
			milestones: THREE_MILESTONES,
		});
		const violations = findCrossMilestoneViolations(roadmap, [
			feature('base'),
			feature('later', { dependencies: ['base'] }),
		]);
		expect(violations).toEqual([]);
	});

	test('resolves dependencies when feature id and directory differ', () => {
		// Spernakit-derived shape: feature.json deps are id-keyed, roadmap keys are directory-keyed.
		const roadmap = roadmapSchema.parse({
			features: { auth: { milestone: 'MVP' }, billing: { milestone: 'v2.0' } },
			milestones: THREE_MILESTONES,
		});
		const violations = findCrossMilestoneViolations(roadmap, [
			feature('spernakit-1700000000-auth', {
				dependencies: ['spernakit-1700000000-billing'],
				directory: 'auth',
			}),
			feature('spernakit-1700000000-billing', { directory: 'billing' }),
		]);
		expect(violations).toEqual([
			{
				dependency: 'billing',
				dependencyMilestone: 'v2.0',
				featureDirectory: 'auth',
				milestone: 'MVP',
			},
		]);
	});

	test('reads directory-keyed dependencies declared on the roadmap itself', () => {
		const roadmap = roadmapSchema.parse({
			features: {
				early: { dependencies: ['late'], milestone: 'MVP' },
				late: { milestone: 'v1.0' },
			},
			milestones: THREE_MILESTONES,
		});
		const violations = findCrossMilestoneViolations(roadmap, [
			feature('early'),
			feature('late'),
		]);
		expect(violations.map((entry) => entry.featureDirectory)).toEqual(['early']);
	});
});

describe('planMilestoneReassign', () => {
	test('pushes a dependent forward to its dependency milestone', () => {
		const roadmap = roadmapSchema.parse({
			features: { early: { milestone: 'MVP' }, late: { milestone: 'v2.0' } },
			milestones: THREE_MILESTONES,
		});
		const plan = planMilestoneReassign(roadmap, [
			feature('early', { dependencies: ['late'] }),
			feature('late'),
		]);
		expect(plan.moves).toEqual([
			{ featureDirectory: 'early', from: 'MVP', reason: 'dependency', to: 'v2.0' },
		]);
		expect(plan.roadmap.features.early?.milestone).toBe('v2.0');
		expect(plan.violations).toEqual([]);
	});

	test('never pulls a dependency backward into an earlier milestone', () => {
		const roadmap = roadmapSchema.parse({
			features: { early: { milestone: 'MVP' }, late: { milestone: 'v2.0' } },
			milestones: THREE_MILESTONES,
		});
		const plan = planMilestoneReassign(roadmap, [
			feature('early', { dependencies: ['late'] }),
			feature('late'),
		]);
		expect(plan.roadmap.features.late?.milestone).toBe('v2.0');
	});

	test('propagates a push transitively through a chain', () => {
		const roadmap = roadmapSchema.parse({
			features: {
				a: { milestone: 'MVP' },
				b: { milestone: 'MVP' },
				c: { milestone: 'v2.0' },
			},
			milestones: THREE_MILESTONES,
		});
		const plan = planMilestoneReassign(roadmap, [
			feature('a', { dependencies: ['b'] }),
			feature('b', { dependencies: ['c'] }),
			feature('c'),
		]);
		expect(plan.roadmap.features.a?.milestone).toBe('v2.0');
		expect(plan.roadmap.features.b?.milestone).toBe('v2.0');
		expect(plan.violations).toEqual([]);
	});

	test('repairs unmapped features into the last milestone', () => {
		const roadmap = roadmapSchema.parse({
			features: { mapped: { milestone: 'MVP' } },
			milestones: THREE_MILESTONES,
		});
		const plan = planMilestoneReassign(roadmap, [feature('mapped'), feature('stray')]);
		expect(plan.moves).toEqual([
			{ featureDirectory: 'stray', from: null, reason: 'unmapped', to: 'v2.0' },
		]);
	});

	test('repairs a mapping pointing at a milestone that does not exist', () => {
		const roadmap = roadmapSchema.parse({
			features: { broken: { milestone: 'v9.9' } },
			milestones: THREE_MILESTONES,
		});
		const plan = planMilestoneReassign(roadmap, [feature('broken')]);
		expect(plan.moves).toEqual([
			{ featureDirectory: 'broken', from: 'v9.9', reason: 'unmapped', to: 'v2.0' },
		]);
	});

	test('leaves cycle members in place and warns instead of guessing', () => {
		const roadmap = roadmapSchema.parse({
			features: { a: { milestone: 'MVP' }, b: { milestone: 'v2.0' } },
			milestones: THREE_MILESTONES,
		});
		const plan = planMilestoneReassign(roadmap, [
			feature('a', { dependencies: ['b'] }),
			feature('b', { dependencies: ['a'] }),
		]);
		expect(plan.moves).toEqual([]);
		expect(plan.warnings.filter((entry) => entry.code === 'dependency_cycle')).toHaveLength(2);
		// The unrepairable violation stays visible rather than being silently dropped.
		expect(plan.violations.map((entry) => entry.featureDirectory)).toEqual(['a']);
	});

	test('warns about a dependency matching no feature on disk', () => {
		const roadmap = roadmapSchema.parse({
			features: { solo: { milestone: 'MVP' } },
			milestones: THREE_MILESTONES,
		});
		const plan = planMilestoneReassign(roadmap, [feature('solo', { dependencies: ['ghost'] })]);
		expect(plan.warnings).toEqual([
			{
				code: 'dangling_dependency',
				detail: "Depends on 'ghost', which matches no feature on disk.",
				featureDirectory: 'solo',
			},
		]);
	});

	test('reports feature.json priorities that no longer match their milestone', () => {
		const roadmap = roadmapSchema.parse({
			features: { drifted: { milestone: 'v2.0' }, synced: { milestone: 'MVP' } },
			milestones: THREE_MILESTONES,
		});
		const plan = planMilestoneReassign(roadmap, [
			feature('drifted', { priority: 1 }),
			feature('synced', { priority: 1 }),
		]);
		expect(plan.priorityUpdates).toEqual([{ featureDirectory: 'drifted', from: 1, to: 3 }]);
	});
});

describe('planMilestoneCreate', () => {
	test('appends by default and leaves existing placement alone', () => {
		const roadmap = roadmapSchema.parse({
			features: { a: { milestone: 'MVP' } },
			milestones: THREE_MILESTONES,
		});
		const plan = planMilestoneCreate(roadmap, [feature('a')], 'v3.0', {
			description: 'future',
		});
		expect(plan.roadmap.milestones['v3.0']).toEqual({ description: 'future', priority: 4 });
		expect(plan.moves).toEqual([]);
	});

	test('inserting at a position renumbers everything after it', () => {
		const roadmap = roadmapSchema.parse({ features: {}, milestones: THREE_MILESTONES });
		const plan = planMilestoneCreate(roadmap, [], 'hardening', { position: 2 });
		expect(plan.roadmap.milestones.MVP?.priority).toBe(1);
		expect(plan.roadmap.milestones.hardening?.priority).toBe(2);
		expect(plan.roadmap.milestones['v1.0']?.priority).toBe(3);
		expect(plan.roadmap.milestones['v2.0']?.priority).toBe(4);
	});

	test('rejects a duplicate name', () => {
		const roadmap = roadmapSchema.parse({ features: {}, milestones: THREE_MILESTONES });
		expect(() => planMilestoneCreate(roadmap, [], 'MVP')).toThrow(MilestoneOperationError);
	});

	test('rejects a name containing a path separator', () => {
		const roadmap = roadmapSchema.parse({ features: {}, milestones: THREE_MILESTONES });
		expect(() => planMilestoneCreate(roadmap, [], 'v1/2')).toThrow('slashes');
	});

	test('rejects a position beyond the end of the list', () => {
		const roadmap = roadmapSchema.parse({ features: {}, milestones: THREE_MILESTONES });
		expect(() => planMilestoneCreate(roadmap, [], 'later', { position: 9 })).toThrow(
			'Position',
		);
	});
});

describe('planMilestoneUpdate', () => {
	test('renaming moves every mapping that pointed at the old name', () => {
		const roadmap = roadmapSchema.parse({
			features: {
				a: { milestone: 'MVP' },
				b: { milestone: 'MVP' },
				c: { milestone: 'v1.0' },
			},
			milestones: THREE_MILESTONES,
		});
		const plan = planMilestoneUpdate(
			roadmap,
			[feature('a'), feature('b'), feature('c')],
			'MVP',
			{
				name: 'foundation',
			},
		);
		expect(plan.roadmap.milestones.MVP).toBeUndefined();
		expect(plan.roadmap.milestones.foundation?.priority).toBe(1);
		expect(plan.moves).toEqual([
			{ featureDirectory: 'a', from: 'MVP', reason: 'rename', to: 'foundation' },
			{ featureDirectory: 'b', from: 'MVP', reason: 'rename', to: 'foundation' },
		]);
	});

	test('renaming preserves the existing description', () => {
		const roadmap = roadmapSchema.parse({ features: {}, milestones: THREE_MILESTONES });
		const plan = planMilestoneUpdate(roadmap, [], 'MVP', { name: 'foundation' });
		expect(plan.roadmap.milestones.foundation?.description).toBe('core');
	});

	test('an empty description clears the field', () => {
		const roadmap = roadmapSchema.parse({ features: {}, milestones: THREE_MILESTONES });
		const plan = planMilestoneUpdate(roadmap, [], 'MVP', { description: '  ' });
		expect(plan.roadmap.milestones.MVP).toEqual({ priority: 1 });
	});

	test('moving a milestone later re-places the features that depended on ordering', () => {
		const roadmap = roadmapSchema.parse({
			features: { early: { milestone: 'MVP' }, late: { milestone: 'v1.0' } },
			milestones: THREE_MILESTONES,
		});
		// MVP moves to the end, so `late` (v1.0) now precedes its dependency in MVP.
		const plan = planMilestoneUpdate(
			roadmap,
			[feature('early'), feature('late', { dependencies: ['early'] })],
			'MVP',
			{ position: 3 },
		);
		expect(plan.roadmap.milestones.MVP?.priority).toBe(3);
		expect(plan.roadmap.features.late?.milestone).toBe('MVP');
		expect(plan.violations).toEqual([]);
	});

	test('rejects renaming onto an existing milestone', () => {
		const roadmap = roadmapSchema.parse({ features: {}, milestones: THREE_MILESTONES });
		expect(() => planMilestoneUpdate(roadmap, [], 'MVP', { name: 'v1.0' })).toThrow(
			'already exists',
		);
	});

	test('rejects an unknown milestone', () => {
		const roadmap = roadmapSchema.parse({ features: {}, milestones: THREE_MILESTONES });
		expect(() => planMilestoneUpdate(roadmap, [], 'nope', { description: 'x' })).toThrow(
			'Unknown roadmap milestone',
		);
	});
});

describe('planMilestoneDelete', () => {
	test('cascades features into the next milestone by default', () => {
		const roadmap = roadmapSchema.parse({
			features: { a: { milestone: 'v1.0' }, b: { milestone: 'v1.0' } },
			milestones: THREE_MILESTONES,
		});
		const plan = planMilestoneDelete(roadmap, [feature('a'), feature('b')], 'v1.0');
		expect(plan.roadmap.milestones['v1.0']).toBeUndefined();
		expect(plan.moves).toEqual([
			{ featureDirectory: 'a', from: 'v1.0', reason: 'delete-cascade', to: 'v2.0' },
			{ featureDirectory: 'b', from: 'v1.0', reason: 'delete-cascade', to: 'v2.0' },
		]);
		expect(plan.roadmap.milestones['v2.0']?.priority).toBe(2);
	});

	test('cascades into the previous milestone when deleting the last one', () => {
		const roadmap = roadmapSchema.parse({
			features: { a: { milestone: 'v2.0' } },
			milestones: THREE_MILESTONES,
		});
		const plan = planMilestoneDelete(roadmap, [feature('a')], 'v2.0');
		expect(plan.moves).toEqual([
			{ featureDirectory: 'a', from: 'v2.0', reason: 'delete-cascade', to: 'v1.0' },
		]);
	});

	test('honours an explicit destination', () => {
		const roadmap = roadmapSchema.parse({
			features: { a: { milestone: 'v1.0' } },
			milestones: THREE_MILESTONES,
		});
		const plan = planMilestoneDelete(roadmap, [feature('a')], 'v1.0', {
			targetMilestone: 'MVP',
		});
		expect(plan.roadmap.features.a?.milestone).toBe('MVP');
	});

	test('a cascade that breaks ordering is repaired in the same plan', () => {
		const roadmap = roadmapSchema.parse({
			features: { dep: { milestone: 'v2.0' }, user: { milestone: 'v1.0' } },
			milestones: THREE_MILESTONES,
		});
		// Deleting MVP cascades nothing, but deleting v1.0 sends `user` to v2.0 alongside its dep.
		const plan = planMilestoneDelete(
			roadmap,
			[feature('dep'), feature('user', { dependencies: ['dep'] })],
			'v1.0',
		);
		expect(plan.roadmap.features.user?.milestone).toBe('v2.0');
		expect(plan.violations).toEqual([]);
	});

	test('refuses to delete the only milestone', () => {
		const roadmap = roadmapSchema.parse({
			features: { a: { milestone: 'MVP' } },
			milestones: { MVP: { priority: 1 } },
		});
		expect(() => planMilestoneDelete(roadmap, [feature('a')], 'MVP')).toThrow('only milestone');
	});

	test('rejects an unknown destination', () => {
		const roadmap = roadmapSchema.parse({ features: {}, milestones: THREE_MILESTONES });
		expect(() => planMilestoneDelete(roadmap, [], 'v1.0', { targetMilestone: 'nope' })).toThrow(
			'Unknown target milestone',
		);
	});
});

describe('MVP status warnings', () => {
	test('warns when a backlog feature is pushed past MVP', () => {
		const roadmap = roadmapSchema.parse({
			features: { dep: { milestone: 'v1.0' }, user: { milestone: 'MVP' } },
			milestones: THREE_MILESTONES,
		});
		const plan = planMilestoneReassign(roadmap, [
			feature('dep'),
			feature('user', { dependencies: ['dep'], status: 'backlog' }),
		]);
		expect(plan.warnings).toEqual([
			{
				code: 'mvp_status_mismatch',
				detail: "Moves past MVP to 'v1.0' while still 'backlog' — the blueprint gate expects 'waiting_approval'.",
				featureDirectory: 'user',
			},
		]);
	});

	test('audit findings are exempt', () => {
		const roadmap = roadmapSchema.parse({
			features: { 'audit-x-1': { milestone: 'MVP' }, dep: { milestone: 'v1.0' } },
			milestones: THREE_MILESTONES,
		});
		const plan = planMilestoneReassign(roadmap, [
			feature('dep'),
			feature('audit-x-1', {
				auditSource: 'audit-x',
				dependencies: ['dep'],
				status: 'backlog',
			}),
		]);
		expect(plan.warnings).toEqual([]);
	});
});

// listFeatures() silently omits any feature whose feature.json is missing or unparseable, so a
// roadmap entry can outlive its readable feature. Placement that only walked the supplied features
// left those entries pointing at a milestone the same operation renamed or deleted — writing the
// exact `invalid_milestone_mapping` state that blocks every coding run project-wide.
describe('roadmap entries with no readable feature', () => {
	const ORPHANED = {
		features: { broken: { milestone: 'MVP' }, ok: { milestone: 'MVP' } },
		milestones: THREE_MILESTONES,
	};

	test('a rename carries the orphaned entry and reports it as a move', () => {
		const roadmap = roadmapSchema.parse(ORPHANED);
		const plan = planMilestoneUpdate(roadmap, [feature('ok')], 'MVP', { name: 'foundation' });
		expect(plan.roadmap.features.broken?.milestone).toBe('foundation');
		expect(plan.roadmap.features.ok?.milestone).toBe('foundation');
		expect(plan.moves.map((move) => move.featureDirectory)).toEqual(['broken', 'ok']);
	});

	test('a delete cascades the orphaned entry to the receiving milestone', () => {
		const roadmap = roadmapSchema.parse(ORPHANED);
		const plan = planMilestoneDelete(roadmap, [feature('ok')], 'MVP');
		expect(plan.roadmap.features.broken?.milestone).toBe('v1.0');
		expect(plan.violations).toEqual([]);
	});

	test('an orphaned entry pointing at an unknown milestone is repaired, not left to block', () => {
		const roadmap = roadmapSchema.parse({
			features: { broken: { milestone: 'deleted-long-ago' } },
			milestones: THREE_MILESTONES,
		});
		const plan = planMilestoneReassign(roadmap, []);
		expect(plan.roadmap.features.broken?.milestone).toBe('v2.0');
		expect(plan.moves).toEqual([
			{
				featureDirectory: 'broken',
				from: 'deleted-long-ago',
				reason: 'unmapped',
				to: 'v2.0',
			},
		]);
	});

	test('no feature.json means no priority write is planned for it', () => {
		const roadmap = roadmapSchema.parse(ORPHANED);
		const plan = planMilestoneUpdate(roadmap, [feature('ok')], 'MVP', { name: 'foundation' });
		expect(plan.priorityUpdates.map((entry) => entry.featureDirectory)).toEqual(['ok']);
	});
});

describe('__proto__ as a milestone name', () => {
	test('is rejected rather than silently vanishing into the prototype', () => {
		const roadmap = roadmapSchema.parse({ features: {}, milestones: THREE_MILESTONES });
		expect(() => planMilestoneCreate(roadmap, [], '__proto__')).toThrow(
			MilestoneOperationError,
		);
		expect(() => planMilestoneUpdate(roadmap, [], 'MVP', { name: '__proto__' })).toThrow(
			'Milestone name cannot be __proto__',
		);
	});

	// Nothing downstream has to defend against the key: roadmapSchema.parse already drops it, so a
	// roadmap.json carrying it never reaches the planners in the first place.
	test('the roadmap schema drops the key before any planner sees it', () => {
		const roadmap = roadmapSchema.parse(
			JSON.parse('{"features":{},"milestones":{"__proto__":{"priority":1},"v1.0":{}}}'),
		);
		expect(Object.keys(roadmap.milestones)).toEqual(['v1.0']);
	});
});
