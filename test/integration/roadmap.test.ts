import { describe, expect, test } from 'bun:test';
import {
	UnknownMilestoneError,
	computeNextMilestoneName,
	evaluateRoadmapCodingGate,
	resolveMilestone,
	roadmapSchema,
	selectAssignmentMilestone,
} from 'aidd-shared/metadata/roadmap';

describe('roadmapSchema', () => {
	test('accepts milestone roadmap shape', () => {
		const parsed = roadmapSchema.parse({
			milestones: {
				MVP: { description: 'minimum viable product' },
				'v1.0': { description: 'first release' },
			},
			features: {
				'feature-auth': { milestone: 'MVP' },
				'feature-billing': { milestone: 'v1.0' },
			},
		});
		expect(Object.keys(parsed.milestones)).toEqual(['MVP', 'v1.0']);
	});

	test('defaults missing milestones/features to empty objects', () => {
		const parsed = roadmapSchema.parse({});
		expect(parsed.milestones).toEqual({});
		expect(parsed.features).toEqual({});
	});

	test('preserves extra fields via passthrough', () => {
		const parsed = roadmapSchema.parse({
			milestones: { MVP: { description: 'd', stretch: true } },
			features: {},
			generatedBy: 'aidd',
		});
		expect((parsed as Record<string, unknown>).generatedBy).toBe('aidd');
	});
});

describe('resolveMilestone', () => {
	const roadmap = roadmapSchema.parse({
		milestones: {
			MVP: { description: 'minimum viable product' },
			'v1.0': { description: 'first release' },
			'v2.0': {},
		},
		features: {
			'feature-auth': { milestone: 'MVP' },
			'feature-billing': { milestone: 'MVP' },
			'feature-reports': { milestone: 'v1.0' },
			'feature-untagged': {},
		},
	});

	test('returns feature directories matching milestone', () => {
		const resolution = resolveMilestone(roadmap, 'MVP');
		expect(resolution.featureDirectories.sort()).toEqual(['feature-auth', 'feature-billing']);
		expect(resolution.description).toBe('minimum viable product');
	});

	test('milestones with no features resolve to empty list', () => {
		const resolution = resolveMilestone(roadmap, 'v2.0');
		expect(resolution.featureDirectories).toEqual([]);
	});

	test('throws UnknownMilestoneError listing available milestones', () => {
		try {
			resolveMilestone(roadmap, 'v3.0');
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(UnknownMilestoneError);
			const typed = error as UnknownMilestoneError;
			expect(typed.milestone).toBe('v3.0');
			expect(typed.available.map((entry) => entry.name).sort()).toEqual([
				'MVP',
				'v1.0',
				'v2.0',
			]);
		}
	});
});

describe('evaluateRoadmapCodingGate', () => {
	test('blocks unmapped current features', () => {
		const roadmap = roadmapSchema.parse({
			milestones: { MVP: {}, v1: {} },
			features: { 'feature-core': { milestone: 'MVP' } },
		});
		const gate = evaluateRoadmapCodingGate(roadmap, [
			{ id: 'feature-core', passes: false },
			{ id: 'feature-new', passes: false },
		]);

		expect(gate.blocked).toBe(true);
		expect(gate.blockReason).toBe('unmapped_features');
		expect(gate.unmappedFeatureDirectories).toEqual(['feature-new']);
	});

	test('blocks current features mapped to unknown milestones', () => {
		const roadmap = roadmapSchema.parse({
			milestones: { MVP: {} },
			features: { 'feature-core': { milestone: 'v9' } },
		});
		const gate = evaluateRoadmapCodingGate(roadmap, [{ id: 'feature-core', passes: false }]);

		expect(gate.blocked).toBe(true);
		expect(gate.blockReason).toBe('invalid_milestone_mapping');
		expect(gate.invalidMappings).toEqual([
			{ featureDirectory: 'feature-core', milestone: 'v9' },
		]);
	});

	test('selects the earliest incomplete milestone and skips later work', () => {
		const roadmap = roadmapSchema.parse({
			milestones: { MVP: {}, v1: {}, v2: {} },
			features: {
				'feature-mvp': { milestone: 'MVP' },
				'feature-v1': { milestone: 'v1' },
				'feature-v2': { milestone: 'v2' },
			},
		});
		const gate = evaluateRoadmapCodingGate(roadmap, [
			{ id: 'feature-mvp', passes: false },
			{ id: 'feature-v1', passes: false },
			{ id: 'feature-v2', passes: false },
		]);

		expect(gate.blocked).toBe(false);
		expect(gate.activeMilestone).toBe('MVP');
		expect(gate.allowedFeatureDirectories).toEqual(['feature-mvp']);
	});

	test('orders milestones by priority after canonical JSON key sorting', () => {
		const roadmap = roadmapSchema.parse({
			milestones: {
				'Core Scheduling': { priority: 2 },
				Foundation: { priority: 1 },
				Operations: { priority: 3 },
			},
			features: {
				'feature-connection': { milestone: 'Foundation' },
				'feature-scheduling': { milestone: 'Core Scheduling' },
				'feature-alerting': { milestone: 'Operations' },
			},
		});
		const gate = evaluateRoadmapCodingGate(roadmap, [
			{ id: 'feature-connection', passes: false },
			{ id: 'feature-scheduling', passes: false },
			{ id: 'feature-alerting', passes: false },
		]);

		expect(gate.activeMilestone).toBe('Foundation');
		expect(gate.allowedFeatureDirectories).toEqual(['feature-connection']);
		expect(gate.milestones).toEqual(['Foundation', 'Core Scheduling', 'Operations']);
	});

	test('advances when earlier milestones are complete', () => {
		const roadmap = roadmapSchema.parse({
			milestones: { MVP: {}, v1: {} },
			features: {
				'feature-mvp': { milestone: 'MVP' },
				'feature-v1': { milestone: 'v1' },
			},
		});
		const gate = evaluateRoadmapCodingGate(roadmap, [
			{ id: 'feature-mvp', passes: true },
			{ id: 'feature-v1', passes: false },
		]);

		expect(gate.activeMilestone).toBe('v1');
		expect(gate.allowedFeatureDirectories).toEqual(['feature-v1']);
	});

	test('skips empty milestones', () => {
		const roadmap = roadmapSchema.parse({
			milestones: { MVP: {}, v1: {} },
			features: { 'feature-v1': { milestone: 'v1' } },
		});
		const gate = evaluateRoadmapCodingGate(roadmap, [{ id: 'feature-v1', passes: false }]);

		expect(gate.activeMilestone).toBe('v1');
		expect(gate.allowedFeatureDirectories).toEqual(['feature-v1']);
	});

	test('reports stale roadmap entries without blocking coding', () => {
		const roadmap = roadmapSchema.parse({
			milestones: { MVP: {} },
			features: {
				'feature-core': { milestone: 'MVP' },
				'feature-deleted': { milestone: 'MVP' },
			},
		});
		const gate = evaluateRoadmapCodingGate(roadmap, [{ id: 'feature-core', passes: false }]);

		expect(gate.blocked).toBe(false);
		expect(gate.staleRoadmapFeatureDirectories).toEqual(['feature-deleted']);
	});
});

describe('computeNextMilestoneName', () => {
	test('returns v1.0 when no version-shaped milestones exist', () => {
		expect(computeNextMilestoneName([])).toBe('v1.0');
		expect(computeNextMilestoneName(['MVP'])).toBe('v1.0');
	});

	test('returns the next major after the highest version milestone', () => {
		expect(computeNextMilestoneName(['v1.0', 'v2.0'])).toBe('v3.0');
		expect(computeNextMilestoneName(['MVP', 'v1.0', 'v2.0'])).toBe('v3.0');
		expect(computeNextMilestoneName(['v3.0', 'v1.0'])).toBe('v4.0');
	});
});

describe('selectAssignmentMilestone', () => {
	test('creates v1.0 when the roadmap has no milestones', () => {
		const roadmap = roadmapSchema.parse({ milestones: {}, features: {} });
		const selection = selectAssignmentMilestone(roadmap, []);

		expect(selection.milestone).toBe('v1.0');
		expect(selection.createdMilestone).toMatchObject({ priority: 1 });
	});

	test('creates the next-version milestone when the active roadmap is fully shipped', () => {
		const roadmap = roadmapSchema.parse({
			milestones: { 'v1.0': { priority: 1 }, 'v2.0': { priority: 2 } },
			features: {
				'feature-a': { milestone: 'v1.0' },
				'feature-b': { milestone: 'v2.0' },
			},
		});
		const selection = selectAssignmentMilestone(roadmap, [
			{ id: 'feature-a', passes: true },
			{ id: 'feature-b', passes: true },
		]);

		expect(selection.milestone).toBe('v3.0');
		expect(selection.createdMilestone).toMatchObject({ priority: 3 });
	});

	test('keeps remediations in the current version when the active roadmap is fully shipped', () => {
		const roadmap = roadmapSchema.parse({
			milestones: { 'v1.0': { priority: 1 }, 'v2.0': { priority: 2 } },
			features: {
				'feature-a': { milestone: 'v1.0' },
				'feature-b': { milestone: 'v2.0' },
			},
		});
		const selection = selectAssignmentMilestone(
			roadmap,
			[
				{ id: 'feature-a', passes: true },
				{ id: 'feature-b', passes: true },
			],
			'remediation-bugfix'
		);

		expect(selection.milestone).toBe('v2.0');
		expect(selection.createdMilestone).toBeUndefined();
	});

	test('keeps audit findings in the current version when the active roadmap is fully shipped', () => {
		const roadmap = roadmapSchema.parse({
			milestones: { 'v1.0': { priority: 1 }, 'v2.0': { priority: 2 } },
			features: {
				'feature-a': { milestone: 'v1.0' },
				'feature-b': { milestone: 'v2.0' },
			},
		});
		const selection = selectAssignmentMilestone(
			roadmap,
			[
				{ id: 'feature-a', passes: true },
				{ id: 'feature-b', passes: true },
			],
			'audit-security-1779339974-cross-drive-paths-bypass-allowed-root-containment'
		);

		expect(selection.milestone).toBe('v2.0');
		expect(selection.createdMilestone).toBeUndefined();
	});

	test('reuses an existing empty future milestone without creating one', () => {
		const roadmap = roadmapSchema.parse({
			milestones: { MVP: { priority: 1 }, 'v1.0': { priority: 2 } },
			features: { 'feature-a': { milestone: 'MVP' } },
		});
		const selection = selectAssignmentMilestone(roadmap, [{ id: 'feature-a', passes: false }]);

		expect(selection.milestone).toBe('v1.0');
		expect(selection.createdMilestone).toBeUndefined();
	});

	test('keeps remediations in the active milestone instead of an empty future milestone', () => {
		const roadmap = roadmapSchema.parse({
			milestones: { MVP: { priority: 1 }, 'v1.0': { priority: 2 } },
			features: { 'feature-a': { milestone: 'MVP' } },
		});
		const selection = selectAssignmentMilestone(
			roadmap,
			[{ id: 'feature-a', passes: false }],
			'remediation-bugfix'
		);

		expect(selection.milestone).toBe('MVP');
		expect(selection.createdMilestone).toBeUndefined();
	});

	test('keeps audit findings in the active milestone instead of an empty future milestone', () => {
		const roadmap = roadmapSchema.parse({
			milestones: { MVP: { priority: 1 }, 'v1.0': { priority: 2 } },
			features: { 'feature-a': { milestone: 'MVP' } },
		});
		const selection = selectAssignmentMilestone(
			roadmap,
			[{ id: 'feature-a', passes: false }],
			'audit-security-1779339974-cross-drive-paths-bypass-allowed-root-containment'
		);

		expect(selection.milestone).toBe('MVP');
		expect(selection.createdMilestone).toBeUndefined();
	});

	test('lts roadmap falls back to the last milestone and never creates one', () => {
		const roadmap = roadmapSchema.parse({
			lifecycle: 'lts',
			milestones: { 'v1.0': { priority: 1 } },
			features: { 'feature-a': { milestone: 'v1.0' } },
		});
		const selection = selectAssignmentMilestone(roadmap, [{ id: 'feature-a', passes: true }]);

		expect(selection.milestone).toBe('v1.0');
		expect(selection.createdMilestone).toBeUndefined();
	});

	test('locked roadmap returns the active milestone when work is incomplete', () => {
		const roadmap = roadmapSchema.parse({
			lifecycle: 'locked',
			milestones: { MVP: { priority: 1 }, 'v1.0': { priority: 2 } },
			features: {
				'feature-a': { milestone: 'MVP' },
				'feature-b': { milestone: 'v1.0' },
			},
		});
		const selection = selectAssignmentMilestone(roadmap, [
			{ id: 'feature-a', passes: false },
			{ id: 'feature-b', passes: false },
		]);

		expect(selection.milestone).toBe('MVP');
		expect(selection.createdMilestone).toBeUndefined();
	});
});
