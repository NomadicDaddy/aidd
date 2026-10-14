import { describe, expect, test } from 'bun:test';

import type { ProcessTableEntry } from '../../shared/src/lib/processTable.ts';

import { stopProcessTree, type TreeStopDeps } from '../../shared/src/lib/processTree.ts';

// A cancellation reported as complete must mean the tree is gone. killProcessTree alone could not
// say so: when the Windows snapshot lost its race only the root was killed, and a root that had
// already exited returned before any descendant was looked at. These fakes stand in for the
// process table and the kills, so each path runs without touching a real process.

const ROOT = 4100;
const CHILD = 4101;
const GRANDCHILD = 4102;

const table: ProcessTableEntry[] = [
	{ pid: ROOT, ppid: 1000 },
	{ pid: CHILD, ppid: ROOT },
	{ pid: GRANDCHILD, ppid: CHILD },
];

interface FakeWorld {
	alive: Set<number>;
	deps: TreeStopDeps;
	killed: number[];
}

function fakeWorld(options: {
	listTable?: TreeStopDeps['listTable'];
	rootAlive?: boolean;
	unkillable?: number[];
}): FakeWorld {
	const alive = new Set([CHILD, GRANDCHILD]);
	if (options.rootAlive !== false) alive.add(ROOT);
	const unkillable = new Set(options.unkillable ?? []);
	const killed: number[] = [];
	const deps: TreeStopDeps = {
		isAlive: (pid) => alive.has(pid),
		killPids: async (pids) => {
			killed.push(...pids);
			for (const pid of pids) if (!unkillable.has(pid)) alive.delete(pid);
		},
		// What the lost-snapshot fallback did: only the root.
		killRoot: async (pid) => {
			killed.push(pid);
			alive.delete(pid);
		},
		listTable: options.listTable ?? (async () => table),
	};
	return { alive, deps, killed };
}

describe('stopProcessTree', () => {
	test('kills the whole tree from one reading and says it is gone', async () => {
		const world = fakeWorld({});
		const report = await stopProcessTree(ROOT, 50, world.deps);
		expect(world.killed).toEqual([GRANDCHILD, CHILD, ROOT]);
		expect(world.alive.size).toBe(0);
		expect(report).toEqual({ complete: true, survivors: [], tableRead: true });
	});

	test('still reaches the descendants when the root has already exited', async () => {
		const world = fakeWorld({ rootAlive: false });
		const report = await stopProcessTree(ROOT, 50, world.deps);
		expect(world.killed).toContain(CHILD);
		expect(world.killed).toContain(GRANDCHILD);
		expect(world.alive.size).toBe(0);
		expect(report.complete).toBe(true);
	});

	test('names a descendant that outlives the kill instead of claiming success', async () => {
		const world = fakeWorld({ unkillable: [GRANDCHILD] });
		const report = await stopProcessTree(ROOT, 50, world.deps);
		expect(report).toEqual({ complete: false, survivors: [GRANDCHILD], tableRead: true });
	});

	test('reports the tree as unconfirmed when the process table cannot be read', async () => {
		for (const listTable of [
			async () => null,
			async () => {
				throw new Error('snapshot unavailable');
			},
		]) {
			const world = fakeWorld({ listTable });
			const report = await stopProcessTree(ROOT, 50, world.deps);
			expect(world.killed).toEqual([ROOT]);
			expect(report).toEqual({ complete: false, survivors: [], tableRead: false });
		}
	});
});
