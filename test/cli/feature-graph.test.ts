import { describe, expect, test } from 'bun:test';
import {
	buildFeatureNeighborhood,
	dependenciesAreSatisfied,
	findDanglingDependencies,
	findDependencyCycles,
	validateFeatureCollection,
} from 'aidd-shared/metadata/features';
import type { Feature } from 'aidd-shared/metadata/features';

function feature(partial: { id: string } & Partial<Feature>): Feature {
	return { passes: false, status: 'backlog', ...partial };
}

describe('buildFeatureNeighborhood', () => {
	test('resolves forward dependencies with their real pass state', () => {
		const all = [
			feature({ id: 'schema', passes: true, status: 'completed', title: 'DB schema' }),
			feature({ dependencies: ['schema'], id: 'api' }),
		];
		const graph = buildFeatureNeighborhood(all[1]!, all);
		expect(graph.id).toBe('api');
		expect(graph.requires).toEqual([
			{
				id: 'schema',
				passes: true,
				ref: 'schema',
				resolved: true,
				status: 'completed',
				title: 'DB schema',
			},
		]);
		expect(graph.blockedBy).toEqual([]);
	});

	test('reports reverse dependencies — who depends on the selected feature', () => {
		const all = [
			feature({ id: 'schema', passes: true }),
			feature({ dependencies: ['schema'], id: 'api' }),
			feature({ dependencies: ['schema'], id: 'admin-ui' }),
			feature({ dependencies: ['api'], id: 'unrelated' }),
		];
		const graph = buildFeatureNeighborhood(all[0]!, all);
		expect(graph.requires).toEqual([]);
		// Sorted by id so the block is stable across store read order.
		expect(graph.requiredBy.map((node) => node.id)).toEqual(['admin-ui', 'api']);
		expect(graph.requiredBy.every((node) => node.resolved)).toBe(true);
	});

	test('resolves a reverse edge declared by directory when id and directory differ', () => {
		// Derived (spernakit-style) projects have id !== directory, and dependency refs in the wild
		// use either. A ref by directory must still produce the reverse edge, or the collateral-impact
		// list silently comes back empty for exactly the projects most likely to have one.
		const target = feature({ directory: 'feature-004-user-model', id: 'user-model' });
		const dependent = feature({
			dependencies: ['feature-004-user-model'],
			directory: 'feature-009-profile-page',
			id: 'profile-page',
		});
		const graph = buildFeatureNeighborhood(target, [target, dependent]);
		expect(graph.id).toBe('feature-004-user-model');
		expect(graph.requiredBy).toHaveLength(1);
		expect(graph.requiredBy[0]?.id).toBe('feature-009-profile-page');
	});

	test('flags an unsatisfied prerequisite in blockedBy, agreeing with the runtime gate', () => {
		const all = [feature({ id: 'schema' }), feature({ dependencies: ['schema'], id: 'api' })];
		const graph = buildFeatureNeighborhood(all[1]!, all);
		expect(graph.blockedBy).toEqual(['schema']);
		expect(dependenciesAreSatisfied(all[1]!, all)).toBe(false);
	});

	test('marks a dangling dependency ref unresolved instead of dropping it', () => {
		const target = feature({ dependencies: ['ghost'], id: 'api' });
		const graph = buildFeatureNeighborhood(target, [target]);
		expect(graph.requires).toEqual([
			{ id: 'ghost', passes: false, ref: 'ghost', resolved: false },
		]);
		expect(graph.blockedBy).toEqual(['ghost']);
	});

	test('records the audit source as a typed edge and ignores self-reference', () => {
		const target = feature({
			auditSource: 'SECURITY',
			dependencies: ['audit-security-001-x'],
			id: 'audit-security-001-x',
		});
		const graph = buildFeatureNeighborhood(target, [target]);
		expect(graph.auditSource).toBe('SECURITY');
		expect(graph.requiredBy).toEqual([]);
	});

	test('preserves the declared ref when it differs from the canonical node id', () => {
		const dependency = feature({
			directory: 'feature-002-schema',
			id: 'schema',
			passes: true,
		});
		const target = feature({ dependencies: ['schema'], id: 'api' });
		const graph = buildFeatureNeighborhood(target, [dependency, target]);
		expect(graph.requires[0]).toMatchObject({ id: 'feature-002-schema', ref: 'schema' });
	});
});

describe('findDanglingDependencies', () => {
	test('reports refs matching no feature and ignores refs by directory', () => {
		const all = [
			feature({ directory: 'feature-002-schema', id: 'schema' }),
			feature({ dependencies: ['feature-002-schema', 'ghost'], id: 'api' }),
		];
		expect(findDanglingDependencies(all)).toEqual([{ id: 'api', ref: 'ghost' }]);
	});

	test('returns nothing for a fully resolvable inventory', () => {
		const all = [feature({ id: 'schema' }), feature({ dependencies: ['schema'], id: 'api' })];
		expect(findDanglingDependencies(all)).toEqual([]);
	});
});

describe('findDependencyCycles', () => {
	test('finds a two-node cycle exactly once regardless of entry point', () => {
		const all = [
			feature({ dependencies: ['b'], id: 'a' }),
			feature({ dependencies: ['a'], id: 'b' }),
		];
		expect(findDependencyCycles(all)).toEqual([['a', 'b', 'a']]);
	});

	test('finds a longer cycle and reports it once, not once per member', () => {
		const all = [
			feature({ dependencies: ['c'], id: 'a' }),
			feature({ dependencies: ['a'], id: 'b' }),
			feature({ dependencies: ['b'], id: 'c' }),
		];
		expect(findDependencyCycles(all)).toEqual([['a', 'c', 'b', 'a']]);
	});

	test('detects a self-dependency as a cycle', () => {
		expect(findDependencyCycles([feature({ dependencies: ['a'], id: 'a' })])).toEqual([
			['a', 'a'],
		]);
	});

	test('reports both cycles when two disjoint ones exist', () => {
		const all = [
			feature({ dependencies: ['b'], id: 'a' }),
			feature({ dependencies: ['a'], id: 'b' }),
			feature({ dependencies: ['y'], id: 'x' }),
			feature({ dependencies: ['x'], id: 'y' }),
		];
		expect(findDependencyCycles(all)).toEqual([
			['a', 'b', 'a'],
			['x', 'y', 'x'],
		]);
	});

	test('keeps a diamond acyclic — a shared prerequisite is not a cycle', () => {
		const all = [
			feature({ id: 'base' }),
			feature({ dependencies: ['base'], id: 'left' }),
			feature({ dependencies: ['base'], id: 'right' }),
			feature({ dependencies: ['left', 'right'], id: 'top' }),
		];
		expect(findDependencyCycles(all)).toEqual([]);
	});

	test('resolves cycle members through directory refs when id and directory differ', () => {
		const all = [
			feature({
				dependencies: ['feature-002-b'],
				directory: 'feature-001-a',
				id: 'alpha',
			}),
			feature({ dependencies: ['alpha'], directory: 'feature-002-b', id: 'beta' }),
		];
		expect(findDependencyCycles(all)).toEqual([
			['feature-001-a', 'feature-002-b', 'feature-001-a'],
		]);
	});
});

describe('validateFeatureCollection — dependency edges', () => {
	test('a dangling ref on unfinished work is a hard issue', () => {
		const result = validateFeatureCollection([feature({ dependencies: ['ghost'], id: 'api' })]);
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0]?.id).toBe('api');
		expect(result.issues[0]?.message).toContain("Dependency 'ghost' matches no known feature");
		expect(result.issues[0]?.message).toContain('can never be selected');
	});

	test('a dangling ref on already-passing work is only a warning', () => {
		// Nothing is stalled, so failing the gate would punish history rather than prevent a stall.
		const result = validateFeatureCollection([
			feature({ dependencies: ['ghost'], id: 'api', passes: true, status: 'completed' }),
		]);
		expect(result.issues).toEqual([]);
		expect(result.warnings.some((issue) => issue.message.includes('stale reference'))).toBe(
			true,
		);
	});

	test('a cycle raises one issue per stalled member and names the path', () => {
		const result = validateFeatureCollection([
			feature({ dependencies: ['b'], id: 'a' }),
			feature({ dependencies: ['a'], id: 'b' }),
		]);
		const cycleIssues = result.issues.filter((issue) => issue.message.includes('cycle'));
		expect(cycleIssues.map((issue) => issue.id)).toEqual(['a', 'b']);
		expect(cycleIssues[0]?.message).toContain('a -> b -> a');
	});

	test('a cycle with one passing member is not reported as blocking', () => {
		// b passes, so a's only dependency is satisfied and the runtime gate WILL select a. Calling
		// that unselectable failed --check-features on a backlog that was making progress.
		const all = [
			feature({ dependencies: ['b'], id: 'a' }),
			feature({ dependencies: ['a'], id: 'b', passes: true, status: 'completed' }),
		];
		expect(dependenciesAreSatisfied(all[0]!, all)).toBe(true);
		const result = validateFeatureCollection(all);
		expect(result.issues.filter((issue) => issue.message.includes('cycle'))).toEqual([]);
		const warning = result.warnings.find((issue) => issue.message.includes('Dependency cycle'));
		expect(warning?.message).toContain('does not block selection');
		expect(warning?.message).toContain('a -> b -> a');
	});

	test('a cycle among fully passing features degrades to a warning', () => {
		const result = validateFeatureCollection([
			feature({ dependencies: ['b'], id: 'a', passes: true, status: 'completed' }),
			feature({ dependencies: ['a'], id: 'b', passes: true, status: 'completed' }),
		]);
		expect(result.issues.filter((issue) => issue.message.includes('cycle'))).toEqual([]);
		expect(result.warnings.some((issue) => issue.message.includes('Dependency cycle'))).toBe(
			true,
		);
	});

	test('a healthy inventory raises no dependency issues', () => {
		const result = validateFeatureCollection([
			feature({ id: 'schema', passes: true, status: 'completed' }),
			feature({ dependencies: ['schema'], id: 'api' }),
		]);
		expect(result.issues).toEqual([]);
	});
});
