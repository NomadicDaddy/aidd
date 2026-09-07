import { describe, expect, test } from 'bun:test';

import {
	ChildProcessReaper,
	type ChildProcessReaperOptions,
	parsePidPpidTable,
	type ProcessTableEntry,
	type ReapDiagnostic,
} from 'aidd-shared/lib/childProcessReaper';
import { isProcessAlive, killProcessTree } from 'aidd-shared/lib/processTree';

import {
	pollFor,
	readLeakedServerInfo,
	writeLeakFixture,
} from '../_helpers/leaky-server-fixture.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';

import { testTempDir } from '../_helpers/temp.ts';
describe('parsePidPpidTable', () => {
	test('parses ps-style and CIM-style pid/ppid lines and skips garbage', () => {
		const output = ['  123   1', '456 123', 'PID PPID', '', 'not a line', '7  '].join('\n');
		expect(parsePidPpidTable(output)).toEqual([
			{ pid: 123, ppid: 1 },
			{ pid: 456, ppid: 123 },
		]);
	});

	test('captures the start-time token when the table carries one', () => {
		const output = ['  123   1 Thu Jul 10 09:15:02 2026', '456 123 20260710091502.123456'].join(
			'\n',
		);
		expect(parsePidPpidTable(output)).toEqual([
			{ pid: 123, ppid: 1, startId: 'Thu Jul 10 09:15:02 2026' },
			{ pid: 456, ppid: 123, startId: '20260710091502.123456' },
		]);
	});
});

/** The chain of rows from `pid` upward, as the real ancestry walk builds it from a snapshot. */
function ancestryIn(table: ProcessTableEntry[], pid: number, maxHops: number): ProcessTableEntry[] {
	const rows = new Map(table.map((entry) => [entry.pid, entry]));
	const chain: ProcessTableEntry[] = [];
	let current = pid;
	for (let hop = 0; hop < maxHops; hop += 1) {
		const entry = rows.get(current);
		if (entry === undefined) break;
		chain.push(entry);
		if (entry.ppid <= 1) break;
		current = entry.ppid;
	}
	return chain;
}

interface FakeWorld {
	alive: Set<number>;
	killed: number[];
	/**
	 * What a single-pid read returns *now*, keyed by pid. Distinct from `table` on purpose: the
	 * reaper's whole pid-reuse defence rests on a read that postdates the snapshot, so a fake that
	 * served both from one source could never express "this pid is a different process now".
	 * Defaults to the table row for any live pid.
	 */
	live: Map<number, ProcessTableEntry>;
	reaper: ChildProcessReaper;
	/** The "current" process table; mutate between phases to simulate exits/re-parenting. */
	table: ProcessTableEntry[];
}

function fakeWorld(
	platform: NodeJS.Platform,
	table: ProcessTableEntry[],
	options: ChildProcessReaperOptions = {},
): FakeWorld {
	const world: FakeWorld = {
		alive: new Set<number>(),
		killed: [],
		live: new Map<number, ProcessTableEntry>(),
		reaper: new ChildProcessReaper({
			...options,
			isAlive: (pid) => world.alive.has(pid),
			killTree: (pid) => {
				world.killed.push(pid);
				world.alive.delete(pid);
				return Promise.resolve();
			},
			listTable: () => Promise.resolve([...world.table]),
			platform,
			readAncestry: (pid, maxHops) => Promise.resolve(ancestryIn(world.table, pid, maxHops)),
			// Never fall through to the real process table: an unstubbed read would walk the host's
			// actual pids and make these cases depend on the machine running them.
			readEntry: (pid) =>
				Promise.resolve(
					world.live.get(pid) ??
						(world.alive.has(pid)
							? (world.table.find((entry) => entry.pid === pid) ?? null)
							: null),
				),
		}),
		table,
	};
	return world;
}

describe('ChildProcessReaper (hermetic)', () => {
	test('reap without attach kills nothing', async () => {
		const world = fakeWorld('win32', [{ pid: 9999, ppid: 100 }]);
		world.alive.add(9999);
		expect(await world.reaper.reap()).toEqual([]);
		expect(world.killed).toEqual([]);
	});

	test('links grandchildren through an intermediate that dies between snapshots', async () => {
		// Snapshot 1 sees root(100) -> shell(200) -> server(300). By reap time the shell is gone
		// but the server row still names it as parent (Windows keeps stale ppids).
		const world = fakeWorld('win32', [
			{ pid: 100, ppid: process.pid },
			{ pid: 200, ppid: 100 },
			{ pid: 300, ppid: 200 },
		]);
		world.alive.add(300);
		world.reaper.attach(100);
		await world.reaper.snapshot();
		expect(world.reaper.trackedPids().sort((a, b) => a - b)).toEqual([200, 300]);
		world.table = [
			{ pid: 100, ppid: process.pid },
			{ pid: 300, ppid: 200 },
		];
		world.alive.add(100); // root still alive: reap must retry the root tree kill too
		const reaped = await world.reaper.reap();
		expect(reaped).toEqual([300]);
		// The root retry goes through killTree but is not reported as a reaped leak.
		expect(world.killed.sort((a, b) => a - b)).toEqual([100, 300]);
	});

	test('does not adopt a stranger subtree through a recycled dead parent', async () => {
		// We keep dead pids in `descendants` on purpose so a link outlives the shell that made it.
		// The cost: if the OS re-issues that dead pid, its new owner's children would be pulled in
		// as ours and tree-killed. A parent that is *present* under a different token is a different
		// process, and its children are not ours.
		const world = fakeWorld('win32', [
			{ pid: 100, ppid: process.pid, startId: 'root' },
			{ pid: 200, ppid: 100, startId: 'shell' },
		]);
		world.reaper.attach(100);
		await world.reaper.snapshot();
		expect(world.reaper.trackedPids()).toEqual([200]);

		// 200 exits; the OS recycles the number for an unrelated process, which spawns two children.
		world.table = [
			{ pid: 100, ppid: process.pid, startId: 'root' },
			{ pid: 200, ppid: 1, startId: 'a-stranger' },
			{ pid: 401, ppid: 200, startId: 'stranger-child' },
			{ pid: 402, ppid: 200, startId: 'stranger-child' },
		];
		world.alive.add(401);
		world.alive.add(402);
		await world.reaper.snapshot();

		expect(world.reaper.trackedPids()).toEqual([200]);
		expect(await world.reaper.reap()).toEqual([]);
		expect(world.killed).toEqual([]);
	});

	// The failure these pin killed live runs. A detached run is launch shell -> relauncher -> CLI;
	// the launch shell exits seconds in, so the relauncher is permanently orphaned onto a dead pid
	// number that Windows keeps reporting on it and the OS is free to hand to someone else. Once
	// the reaper tracked whatever inherited that number, the run's own tree read as its descendants
	// and teardown killed the CLI mid-iteration — no crash, no log line, six runs lost.
	describe('protects the run that owns it', () => {
		test('never kills a pid on our own ancestry chain, whatever the table calls it', async () => {
			// The table claims our launcher (500) is a child of the backend root. That claim is what
			// a reissued pid produces, and it is indistinguishable from a real child from below —
			// so the guard cannot be an identity check. It has to be "would this kill us?".
			const world = fakeWorld('win32', [
				{ pid: 100, ppid: process.pid, startId: 'root' },
				{ pid: 200, ppid: 100, startId: 'leak' },
				{ pid: 500, ppid: 100, startId: 'our-launcher' },
				{ pid: process.pid, ppid: 500, startId: 'self' },
			]);
			world.alive.add(200);
			world.alive.add(500);
			world.reaper.attach(100);
			await world.reaper.snapshot();
			// Tracked, deliberately: the point is that tracking is not licence to kill.
			expect(world.reaper.trackedPids()).toContain(500);

			expect(await world.reaper.reap()).toEqual([200]);
			expect(world.killed).toEqual([200]);
			expect(world.alive.has(500)).toBe(true);
		});

		test('spares a pid the caller declared load-bearing', async () => {
			// The ancestry walk needs a process table; when the probe behind it returns nothing,
			// the caller-supplied pid is the only thing holding the guard up.
			const world = fakeWorld(
				'win32',
				[
					{ pid: 100, ppid: process.pid, startId: 'root' },
					{ pid: 200, ppid: 100, startId: 'leak' },
					{ pid: 900, ppid: 100, startId: 'our-launcher' },
				],
				{ protectedPids: [900] },
			);
			world.alive.add(200);
			world.alive.add(900);
			world.reaper.attach(100);
			await world.reaper.snapshot();

			expect(await world.reaper.reap()).toEqual([200]);
			expect(world.alive.has(900)).toBe(true);
		});

		test('a tracked pid that exits adopts no new children afterwards', async () => {
			// The exact hole: 200 is simply gone, so there is no row to compare tokens against and
			// linkIsSound has nothing to reject. Anything naming it as parent from here on is
			// unattributable — a pre-existing orphan of the pid's previous owner, or of its next.
			const world = fakeWorld('win32', [
				{ pid: 100, ppid: process.pid, startId: 'root' },
				{ pid: 200, ppid: 100, startId: 'shell' },
			]);
			world.reaper.attach(100);
			await world.reaper.snapshot();
			expect(world.reaper.trackedPids()).toEqual([200]);

			world.table = [
				{ pid: 100, ppid: process.pid, startId: 'root' },
				{ pid: 900, ppid: 200, startId: 'orphan-of-the-old-200' },
			];
			world.alive.add(900);

			expect(await world.reaper.reap()).toEqual([]);
			expect(world.reaper.trackedPids()).toEqual([200]);
			expect(world.killed).toEqual([]);
		});

		test('refuses a child that already existed when its claimed parent was created', async () => {
			// A process cannot predate its own parent, so the link is proof of a recycled number.
			// This is the one check available when the parent is the root itself, which never
			// retires: a backend that exits leaving a server behind is the leak we exist for.
			const world = fakeWorld('win32', [
				{ pid: 100, ppid: process.pid, startId: '900000' },
				{ pid: 300, ppid: 100, startId: '100000' },
			]);
			world.alive.add(300);
			world.reaper.attach(100);
			await world.reaper.snapshot();

			expect(world.reaper.trackedPids()).toEqual([]);
			expect(await world.reaper.reap()).toEqual([]);
		});
	});

	test('reports each victim with its image name and parent', async () => {
		const diagnostics: ReapDiagnostic[] = [];
		const world = fakeWorld(
			'win32',
			[
				{ pid: 100, ppid: process.pid, startId: 'root' },
				{ name: 'node.exe', pid: 300, ppid: 100, startId: 'server' },
			],
			{ onReap: (diagnostic) => diagnostics.push(diagnostic) },
		);
		world.alive.add(300);
		world.reaper.attach(100);

		expect(await world.reaper.reap()).toEqual([300]);
		expect(diagnostics.at(-1)?.victims).toEqual([{ image: 'node.exe', pid: 300, ppid: 100 }]);
	});

	test('discovers a leak in the final reap snapshot even with no prior snapshot', async () => {
		const world = fakeWorld('win32', [
			{ pid: 100, ppid: process.pid },
			{ pid: 200, ppid: 100 },
			{ pid: 300, ppid: 200 },
		]);
		world.alive.add(300);
		world.reaper.attach(100);
		expect(await world.reaper.reap()).toEqual([300]);
	});

	// The Windows probe (pwsh + WMI) costs seconds even on an idle machine, so a loaded box can
	// blow its budget. Before, a failed final probe meant reap() returned [] and the leaked
	// server survived the run: the reaper silently did nothing exactly when it was needed.
	describe('final probe fails', () => {
		/** Fails the Nth listTable call (1-indexed), simulating a timed-out teardown probe. */
		function worldWithFailingProbe(failOnCall: number, rows: ProcessTableEntry[]) {
			const alive = new Set<number>();
			const killed: number[] = [];
			const diagnostics: ReapDiagnostic[] = [];
			/** Overrides what a single-pid read sees now — how a case stages a recycled pid. */
			const live = new Map<number, ProcessTableEntry>();
			let calls = 0;
			const reaper = new ChildProcessReaper({
				isAlive: (pid) => alive.has(pid),
				killTree: (pid) => {
					killed.push(pid);
					alive.delete(pid);
					return Promise.resolve();
				},
				listTable: () => {
					calls += 1;
					return Promise.resolve(calls === failOnCall ? null : [...rows]);
				},
				onReap: (diagnostic) => diagnostics.push(diagnostic),
				platform: 'win32',
				readAncestry: (pid, maxHops) => Promise.resolve(ancestryIn(rows, pid, maxHops)),
				readEntry: (pid) =>
					Promise.resolve(
						live.get(pid) ??
							(alive.has(pid)
								? (rows.find((entry) => entry.pid === pid) ?? null)
								: null),
					),
			});
			return { alive, diagnostics, killed, live, reaper };
		}

		test('falls back to the last good snapshot and still reaps the leak', async () => {
			const world = worldWithFailingProbe(2, [
				{ pid: 100, ppid: process.pid, startId: 'root' },
				{ pid: 300, ppid: 100, startId: 'server' },
			]);
			world.alive.add(300);
			world.reaper.attach(100);
			await world.reaper.snapshot(); // call 1: good, records the descendant
			// call 2 (the teardown probe) returns null — the reap must not give up.
			expect(await world.reaper.reap()).toEqual([300]);
			expect(world.killed).toEqual([300]);
			expect(world.diagnostics.at(-1)?.usedStaleTable).toBe(true);
		});

		test('refuses a snapshot older than the staleness cap', async () => {
			const world = worldWithFailingProbe(2, [
				{ pid: 100, ppid: process.pid, startId: 'root' },
				{ pid: 300, ppid: 100, startId: 'server' },
			]);
			world.alive.add(300);
			world.reaper.attach(100);
			await world.reaper.snapshot();
			// @ts-expect-error - age the cached snapshot past the cap without waiting a minute.
			world.reaper.tables.last.at -= 61_000;
			// Minutes-old topology is not evidence about what is alive now: leak, as before.
			expect(await world.reaper.reap()).toEqual([]);
			expect(world.killed).toEqual([]);
		});

		test('will not kill a pid the OS recycled after the last good snapshot', async () => {
			// The hazard the stale path has to survive. Both the recorded row and the cached table
			// predate the reap, so matching them against each other proves only that 300 was stable
			// between two past moments. Here 300 exits after the snapshot and Windows hands the
			// number to a stranger — likeliest exactly here, since the probe timed out because the
			// box is loaded. Only a read taken now can see that, and it must veto the kill.
			const world = worldWithFailingProbe(2, [
				{ pid: 100, ppid: process.pid, startId: 'root' },
				{ pid: 300, ppid: 100, startId: 'server' },
			]);
			world.alive.add(300);
			world.reaper.attach(100);
			await world.reaper.snapshot();
			world.live.set(300, { pid: 300, ppid: 100, startId: 'a-stranger' });

			expect(await world.reaper.reap()).toEqual([]);
			expect(world.killed).toEqual([]);
		});

		test('will not kill a root the OS recycled after it was verified', async () => {
			// rootVerified latches at attach and proves the pid was ours *then*. The root is never
			// in `descendants`, so before this it was tree-killed on liveness alone.
			const world = worldWithFailingProbe(3, [
				{ pid: 100, ppid: process.pid, startId: 'root' },
				{ pid: 300, ppid: 100, startId: 'server' },
			]);
			world.alive.add(100);
			world.reaper.attach(100);
			await world.reaper.snapshot();
			world.live.set(100, { pid: 100, ppid: process.pid, startId: 'a-stranger' });

			await world.reaper.reap();
			expect(world.killed).not.toContain(100);
		});

		test('will not kill from a stale table without a start-time token', async () => {
			// No startId: a matching ppid could be a recycled pid that inherited the same parent,
			// and a stale table cannot tell the difference. Leak rather than kill a stranger.
			const world = worldWithFailingProbe(2, [
				{ pid: 100, ppid: process.pid },
				{ pid: 300, ppid: 100 },
			]);
			world.alive.add(300);
			world.reaper.attach(100);
			await world.reaper.snapshot();
			expect(await world.reaper.reap()).toEqual([]);
			expect(world.killed).toEqual([]);
		});
	});

	test('windows pid-reuse guard: a changed ppid means the pid was recycled', async () => {
		const world = fakeWorld('win32', [
			{ pid: 100, ppid: process.pid },
			{ pid: 300, ppid: 100 },
		]);
		world.alive.add(300);
		world.reaper.attach(100);
		await world.reaper.snapshot();
		// Reap-time table: pid 300 now has a different parent (recycled pid) — never killed.
		world.table = [{ pid: 300, ppid: 5555 }];
		expect(await world.reaper.reap()).toEqual([]);
		expect(world.killed).toEqual([]);
	});

	test('posix orphan re-parent is killed only when the recorded parent is gone', async () => {
		const world = fakeWorld('linux', [
			{ pid: 100, ppid: process.pid },
			{ pid: 200, ppid: 100 },
			{ pid: 300, ppid: 150 },
		]);
		world.alive.add(200);
		world.alive.add(300);
		world.alive.add(150); // 300's recorded parent stays alive -> its ppid change means reuse
		world.reaper.attach(100);
		await world.reaper.snapshot();
		world.table = [
			{ pid: 200, ppid: 1 },
			{ pid: 300, ppid: 1 },
		];
		// 300 is only tracked if 150 was tracked; it never was (150's parent is unknown), so only
		// 200 is a descendant here — keep the scenario to the orphan/reuse distinction on 200.
		expect(await world.reaper.reap()).toEqual([200]);
		expect(world.killed).toEqual([200]);
	});

	test('posix: a tracked pid whose recorded parent is still alive is not killed on ppid change', async () => {
		const world = fakeWorld('linux', [
			{ pid: 100, ppid: process.pid },
			{ pid: 200, ppid: 100 },
			{ pid: 300, ppid: 200 },
		]);
		world.alive.add(200); // intermediate stays alive
		world.alive.add(300);
		world.reaper.attach(100);
		await world.reaper.snapshot();
		// 300's row changes parent while its recorded parent (200) is alive: recycled pid.
		world.table = [
			{ pid: 200, ppid: 100 },
			{ pid: 300, ppid: 1 },
		];
		expect(await world.reaper.reap()).toEqual([200]);
		expect(world.killed).toEqual([200]);
	});

	test('start-time identity: a recycled pid with the same ppid is never killed', async () => {
		// Same pid, same recorded parent — but a different start time. Without the start token
		// the ppid heuristic would kill it; the token proves it is a stranger.
		const world = fakeWorld('linux', [
			{ pid: 100, ppid: process.pid },
			{ pid: 200, ppid: 100, startId: 't0' },
		]);
		world.alive.add(200);
		world.reaper.attach(100);
		await world.reaper.snapshot();
		world.table = [{ pid: 200, ppid: 100, startId: 't9' }];
		expect(await world.reaper.reap()).toEqual([]);
		expect(world.killed).toEqual([]);
	});

	test('start-time identity: an orphan keeps its token through re-parenting and is reaped', async () => {
		const world = fakeWorld('linux', [
			{ pid: 100, ppid: process.pid },
			{ pid: 200, ppid: 100, startId: 't0' },
		]);
		world.alive.add(200);
		world.alive.add(100); // even with the recorded parent alive, the token decides
		world.reaper.attach(100);
		await world.reaper.snapshot();
		world.table = [{ pid: 200, ppid: 1, startId: 't0' }];
		const reaped = await world.reaper.reap();
		expect(reaped).toEqual([200]);
	});

	test('a pid alive but missing from the reap table is skipped (identity unconfirmed)', async () => {
		const world = fakeWorld('linux', [
			{ pid: 100, ppid: process.pid },
			{ pid: 300, ppid: 100 },
		]);
		world.alive.add(300);
		world.reaper.attach(100);
		await world.reaper.snapshot();
		world.table = [];
		expect(await world.reaper.reap()).toEqual([]);
		expect(world.killed).toEqual([]);
	});

	test('never kills the current process even when the table claims it as a descendant', async () => {
		const self = process.pid;
		const world = fakeWorld('linux', [
			{ pid: 100, ppid: self },
			{ pid: self, ppid: 100 },
		]);
		world.alive.add(self);
		world.reaper.attach(100);
		await world.reaper.snapshot();
		expect(await world.reaper.reap()).toEqual([]);
		expect(world.killed).toEqual([]);
	});

	test('refuses to reap when the root is not a verified child of this process', async () => {
		// A root pid that belongs to someone else (stale record, fabricated event, test fixture):
		// the walk would target an unrelated tree, so nothing may be killed — not even the root.
		const world = fakeWorld('win32', [
			{ pid: 100, ppid: 4242 },
			{ pid: 300, ppid: 100 },
		]);
		world.alive.add(100);
		world.alive.add(300);
		world.reaper.attach(100);
		await world.reaper.snapshot();
		expect(await world.reaper.reap()).toEqual([]);
		expect(world.killed).toEqual([]);
	});
});

describe('ChildProcessReaper (snapshot cadence)', () => {
	test(
		'samples densely right after attach, so a short-lived intermediate is still caught',
		async () => {
			// The regression: a flat 10s cadence took exactly one snapshot (the one at attach) inside
			// the first second, so a shell that spawned a server and exited a beat later was gone
			// before the chain was ever sampled, and the leak became unreapable.
			let probes = 0;
			const reaper = new ChildProcessReaper({
				isAlive: () => false,
				killTree: () => Promise.resolve(),
				listTable: () => {
					probes += 1;
					return Promise.resolve([{ pid: process.pid, ppid: 1 }]);
				},
				readEntry: () => Promise.resolve(null),
			});
			try {
				reaper.attach(process.pid);
				await Bun.sleep(1_500);
				expect(probes).toBeGreaterThanOrEqual(3);
			} finally {
				reaper.stop();
			}
		},
		{ timeout: 20_000 },
	);
});

describe('ChildProcessReaper (real processes)', () => {
	test(
		'a leaked listening grandchild that outlives the backend is reaped at teardown',
		async () => {
			const dir = await testTempDir('aidd-reaper-');
			const { grandchildPath, infoPath, intermediatePath } = await writeLeakFixture(dir);
			const reaper = new ChildProcessReaper({ activityDelayMs: 50, intervalMs: 200 });
			let grandchildPid: number | undefined;
			try {
				const intermediate = Bun.spawn(
					[process.execPath, 'run', intermediatePath, grandchildPath, infoPath],
					{ stderr: 'inherit', stdin: 'ignore', stdout: 'ignore', windowsHide: true },
				);
				reaper.attach(intermediate.pid);
				const info = await pollFor(() => readLeakedServerInfo(infoPath), 20_000);
				grandchildPid = info.pid;
				// The server must actually be listening before we tear anything down.
				const response = await fetch(`http://127.0.0.1:${info.port}/`);
				expect(await response.text()).toBe('ok');
				// The tracker must link the grandchild while the intermediate chain is alive.
				await pollFor(
					() =>
						Promise.resolve(reaper.trackedPids().includes(info.pid) ? true : undefined),
					15_000,
				);
				await intermediate.exited;
				// The backend (intermediate) is gone; the listener survived it — the leak.
				expect(isProcessAlive(info.pid)).toBe(true);
				const reaped = await reaper.reap();
				expect(reaped).toContain(info.pid);
				await pollFor(
					() => Promise.resolve(isProcessAlive(info.pid) ? undefined : true),
					5_000,
				);
				expect(isProcessAlive(info.pid)).toBe(false);
			} finally {
				reaper.stop();
				await killProcessTree(grandchildPid);
				await removeTempTree(dir);
			}
		},
		{ timeout: 60_000 },
	);
});
