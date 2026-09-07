import { describe, expect, test } from 'bun:test';
import { buildDependencyTopology } from 'aidd-shared/metadata/features';
import type { Feature } from 'aidd-shared/metadata/features';

function feature(partial: { id: string } & Partial<Feature>): Feature {
	return { passes: false, status: 'backlog', ...partial };
}

describe('buildDependencyTopology', () => {
	test('ranks hubs by fan-in, highest first', () => {
		const all = [
			feature({ id: 'core' }),
			feature({ id: 'side' }),
			feature({ dependencies: ['core'], id: 'a' }),
			feature({ dependencies: ['core'], id: 'b' }),
			feature({ dependencies: ['core', 'side'], id: 'c' }),
		];
		const topology = buildDependencyTopology(all);
		expect(topology.hubs.map((hub) => [hub.id, hub.dependentCount])).toEqual([
			['core', 3],
			['side', 1],
		]);
		expect(topology.hubs[0]?.dependents).toEqual(['a', 'b', 'c']);
		expect(topology.edgeCount).toBe(4);
		expect(topology.featureCount).toBe(5);
	});

	test('omits leaves — a feature nothing depends on carries no blast-radius signal', () => {
		const all = [feature({ id: 'core' }), feature({ dependencies: ['core'], id: 'leaf' })];
		expect(buildDependencyTopology(all).hubs.map((hub) => hub.id)).toEqual(['core']);
	});

	test('carries the hub affectedFiles so a finding can be mapped to a hub', () => {
		const all = [
			feature({ affectedFiles: ['src/core.ts', ' src/util.ts '], id: 'core' }),
			feature({ dependencies: ['core'], id: 'a' }),
		];
		expect(buildDependencyTopology(all).hubs[0]?.affectedFiles).toEqual([
			'src/core.ts',
			'src/util.ts',
		]);
	});

	test('caps the hub list and reports how many were dropped', () => {
		const all = [
			feature({ id: 'x' }),
			feature({ id: 'y' }),
			feature({ dependencies: ['x', 'y'], id: 'dep' }),
		];
		const topology = buildDependencyTopology(all, { hubLimit: 1 });
		expect(topology.hubs).toHaveLength(1);
		expect(topology.omittedHubCount).toBe(1);
	});

	test('never silently truncates a hub file list', () => {
		const files = Array.from({ length: 14 }, (_, index) => `src/file-${index}.ts`);
		const all = [
			feature({ affectedFiles: files, id: 'core' }),
			feature({ dependencies: ['core'], id: 'a' }),
		];
		const hub = buildDependencyTopology(all).hubs[0]!;
		expect(hub.affectedFiles).toHaveLength(10);
		expect(hub.omittedFileCount).toBe(4);
	});

	test('resolves fan-in through a dependency declared by directory', () => {
		const all = [
			feature({ directory: 'feature-001-core', id: 'core' }),
			feature({ dependencies: ['feature-001-core'], directory: 'feature-002-a', id: 'a' }),
		];
		const topology = buildDependencyTopology(all);
		expect(topology.hubs[0]?.id).toBe('feature-001-core');
		expect(topology.hubs[0]?.dependents).toEqual(['feature-002-a']);
	});

	test('excludes dangling refs from the edge count and lists them separately', () => {
		const all = [feature({ dependencies: ['ghost'], id: 'a' })];
		const topology = buildDependencyTopology(all);
		expect(topology.edgeCount).toBe(0);
		expect(topology.dangling).toEqual([{ id: 'a', ref: 'ghost' }]);
		expect(topology.hubs).toEqual([]);
	});

	test('carries dependency cycles for the auditor to report, marked deadlocked', () => {
		const all = [
			feature({ dependencies: ['b'], id: 'a' }),
			feature({ dependencies: ['a'], id: 'b' }),
		];
		expect(buildDependencyTopology(all).cycles).toEqual([
			{ deadlocked: true, path: ['a', 'b', 'a'] },
		]);
	});

	test('marks a cycle with a passing member as not deadlocked', () => {
		// The auditor scores severity off this flag, so it must agree with the runtime gate: b passing
		// makes a selectable, and the loop drains.
		const all = [
			feature({ dependencies: ['b'], id: 'a' }),
			feature({ dependencies: ['a'], id: 'b', passes: true, status: 'completed' }),
		];
		expect(buildDependencyTopology(all).cycles).toEqual([
			{ deadlocked: false, path: ['a', 'b', 'a'] },
		]);
	});

	test('is empty and defect-free for an empty inventory', () => {
		expect(buildDependencyTopology([])).toEqual({
			cycles: [],
			dangling: [],
			edgeCount: 0,
			featureCount: 0,
			hubs: [],
			omittedHubCount: 0,
		});
	});
});
