import type { TerminalServerFrame } from 'aidd-shared/contracts/terminal';

import { describe, expect, test } from 'bun:test';

import type {
	PtyHandle,
	PtySpawn,
	PtySpawnOptions,
} from '../../backend/src/services/terminal/ptyProvider.ts';

import {
	TerminalLimitError,
	TerminalSessionManager,
	TerminalSpawnError,
	TerminalUnavailableError,
	type TerminalAttachment,
} from '../../backend/src/services/terminal/sessionManager.ts';

const SHELLS = [
	{ args: ['-NoLogo'], id: 'pwsh', label: 'PowerShell 7', path: 'C:\\fake\\pwsh.exe' },
	{ args: [], id: 'cmd', label: 'Command Prompt', path: 'C:\\fake\\cmd.exe' },
];

class FakePty implements PtyHandle {
	static nextPid = 1000;
	dataListener: ((data: string) => void) | undefined;
	exitListener: ((event: { exitCode: number }) => void) | undefined;
	killed = false;
	readonly options: PtySpawnOptions;
	readonly pid = FakePty.nextPid++;
	resizes: { cols: number; rows: number }[] = [];
	writes: string[] = [];

	constructor(options: PtySpawnOptions) {
		this.options = options;
	}

	emitData(data: string): void {
		this.dataListener?.(data);
	}

	emitExit(exitCode: number): void {
		this.exitListener?.({ exitCode });
	}

	kill(): void {
		this.killed = true;
	}

	onData(listener: (data: string) => void) {
		this.dataListener = listener;
		return { dispose: () => {} };
	}

	onExit(listener: (event: { exitCode: number }) => void) {
		this.exitListener = listener;
		return { dispose: () => {} };
	}

	resize(cols: number, rows: number): void {
		this.resizes.push({ cols, rows });
	}

	write(data: string): void {
		this.writes.push(data);
	}
}

/** A real directory — create() stat-validates the working directory before spawning. */
const ROOT_DIR = import.meta.dir;

function createManager() {
	const spawned: FakePty[] = [];
	const treeKills: number[] = [];
	const spawnPty: PtySpawn = (_file, _args, options) => {
		const pty = new FakePty(options);
		spawned.push(pty);
		return pty;
	};
	const manager = new TerminalSessionManager({
		killTree: (pid) => {
			treeKills.push(pid);
			return Promise.resolve();
		},
		listShells: () => SHELLS,
		rootDir: ROOT_DIR,
		spawnPty,
	});
	return { manager, spawned, treeKills };
}

function collector(): { attachment: TerminalAttachment; frames: TerminalServerFrame[] } {
	const frames: TerminalServerFrame[] = [];
	return { attachment: { send: (frame) => frames.push(frame) }, frames };
}

async function nextFlush(): Promise<void> {
	await Bun.sleep(25);
}

/** Waits out the headless mirror's async parse queue until `predicate` sees the settled state. */
async function waitForMirror(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
	const start = Date.now();
	while (!predicate()) {
		if (Date.now() - start > timeoutMs) throw new Error('mirror parse timeout');
		await Bun.sleep(20);
	}
}

describe('TerminalSessionManager', () => {
	test('is unavailable without a pty provider', () => {
		const manager = new TerminalSessionManager({
			listShells: () => SHELLS,
			rootDir: ROOT_DIR,
			spawnPty: null,
		});
		expect(manager.available).toBe(false);
		expect(() => manager.create()).toThrow(TerminalUnavailableError);
		expect(manager.listSessions()).toEqual([]);
	});

	test('create spawns independent sessions with the default shell + root cwd', () => {
		const { manager, spawned } = createManager();
		const first = manager.create();
		expect(first.shellId).toBe('pwsh');
		expect(first.cwd).toBe(ROOT_DIR);
		expect(spawned[0]?.options.cwd).toBe(ROOT_DIR);
		const second = manager.create({ shellId: 'cmd' });
		expect(second.sessionId).not.toBe(first.sessionId);
		expect(second.shellId).toBe('cmd');
		expect(spawned).toHaveLength(2);
		expect(manager.listSessions()).toHaveLength(2);
	});

	test('create honors a valid cwd and rejects a bogus one', () => {
		const { manager, spawned } = createManager();
		const info = manager.create({ cwd: ROOT_DIR });
		expect(info.cwd).toBe(ROOT_DIR);
		expect(spawned[0]?.options.cwd).toBe(ROOT_DIR);
		expect(() => manager.create({ cwd: 'D:\\definitely\\not\\a\\real\\dir' })).toThrow(
			TerminalSpawnError
		);
	});

	test('create enforces the running-session cap', () => {
		const { manager, spawned } = createManager();
		for (let i = 0; i < 8; i++) manager.create();
		expect(() => manager.create()).toThrow(TerminalLimitError);
		// An exited session frees a slot.
		spawned[0]?.emitExit(0);
		expect(() => manager.create()).not.toThrow();
	});

	test('output is routed only to the session it belongs to', async () => {
		const { manager, spawned } = createManager();
		const first = manager.create();
		const second = manager.create();
		const a = collector();
		const b = collector();
		manager.attach(first.sessionId, a.attachment);
		manager.attach(second.sessionId, b.attachment);
		spawned[0]?.emitData('for-first');
		spawned[1]?.emitData('for-second');
		await nextFlush();
		expect(a.frames).toEqual([{ data: 'for-first', type: 'output' }]);
		expect(b.frames).toEqual([{ data: 'for-second', type: 'output' }]);
	});

	test('attach replays scrollback in the hello frame before live output', async () => {
		const { manager, spawned } = createManager();
		const info = manager.create();
		spawned[0]?.emitData('before-attach');
		await nextFlush();
		const { attachment, frames } = collector();
		const hello = manager.attach(info.sessionId, attachment);
		expect(hello?.type).toBe('hello');
		if (hello?.type === 'hello') expect(hello.replay).toContain('before-attach');
		spawned[0]?.emitData('after-attach');
		await nextFlush();
		expect(frames).toEqual([{ data: 'after-attach', type: 'output' }]);
	});

	test('attach to an unknown session returns null', () => {
		const { manager } = createManager();
		const { attachment } = collector();
		expect(manager.attach('nope', attachment)).toBeNull();
	});

	test('output is coalesced across the flush window and fanned out to all attachments', async () => {
		const { manager, spawned } = createManager();
		const info = manager.create();
		const a = collector();
		const b = collector();
		manager.attach(info.sessionId, a.attachment);
		manager.attach(info.sessionId, b.attachment);
		spawned[0]?.emitData('one ');
		spawned[0]?.emitData('two');
		await nextFlush();
		expect(a.frames).toEqual([{ data: 'one two', type: 'output' }]);
		expect(b.frames).toEqual([{ data: 'one two', type: 'output' }]);
	});

	test('replay is bounded by the mirror scrollback window, keeping only recent lines', async () => {
		const { manager, spawned } = createManager();
		const info = manager.create();
		spawned[0]?.emitData('first-marker\r\n');
		const lines = Array.from({ length: 6000 }, (_, i) => `line-${i}`).join('\r\n');
		spawned[0]?.emitData(`${lines}\r\n`);
		const replay = (): string => {
			const hello = manager.attach(info.sessionId, collector().attachment);
			return hello?.type === 'hello' ? hello.replay : '';
		};
		// Once the mirror has parsed everything, lines past the scrollback window are gone.
		await waitForMirror(() => !replay().includes('first-marker'));
		expect(replay()).toContain('line-5999');
	});

	test('write and resize reach the pty; resize clamps and ignores nonsense', () => {
		const { manager, spawned } = createManager();
		const info = manager.create();
		manager.write(info.sessionId, 'echo hi\r');
		manager.resize(info.sessionId, 120, 40);
		manager.resize(info.sessionId, 0, -3);
		manager.resize(info.sessionId, 10_000, 10_000);
		expect(spawned[0]?.writes).toEqual(['echo hi\r']);
		expect(spawned[0]?.resizes).toEqual([
			{ cols: 120, rows: 40 },
			{ cols: 500, rows: 300 },
		]);
	});

	test('pty exit broadcasts pending output then the exit frame; create respawns', async () => {
		const { manager, spawned } = createManager();
		const info = manager.create();
		const { attachment, frames } = collector();
		manager.attach(info.sessionId, attachment);
		spawned[0]?.emitData('bye');
		spawned[0]?.emitExit(0);
		expect(frames).toEqual([
			{ data: 'bye', type: 'output' },
			{ exitCode: 0, type: 'exit' },
		]);
		await nextFlush();
		const next = manager.create();
		expect(next.sessionId).not.toBe(info.sessionId);
		expect(spawned).toHaveLength(2);
	});

	test('writes to an exited session are dropped', () => {
		const { manager, spawned } = createManager();
		const info = manager.create();
		spawned[0]?.emitExit(1);
		manager.write(info.sessionId, 'ignored');
		expect(spawned[0]?.writes).toEqual([]);
	});

	test('a throwing attachment is pruned without breaking the others', async () => {
		const { manager, spawned } = createManager();
		const info = manager.create();
		const good = collector();
		manager.attach(info.sessionId, {
			send: () => {
				throw new Error('dead socket');
			},
		});
		manager.attach(info.sessionId, good.attachment);
		spawned[0]?.emitData('still-flowing');
		await nextFlush();
		expect(good.frames).toEqual([{ data: 'still-flowing', type: 'output' }]);
	});

	test('flow control drops output past the high watermark and resyncs on ack drain', async () => {
		const { manager, spawned } = createManager();
		const info = manager.create();
		const { attachment, frames } = collector();
		manager.attach(info.sessionId, attachment);
		spawned[0]?.emitData('a'.repeat(60_000));
		await nextFlush();
		expect(frames).toHaveLength(1);
		// Second burst pushes cumulative unacked past 100k — dropped, not sent.
		spawned[0]?.emitData('b'.repeat(60_000));
		await nextFlush();
		expect(frames).toHaveLength(1);
		// Draining below the low watermark triggers a scrollback snapshot resync.
		manager.ack(info.sessionId, attachment, 60_000);
		expect(frames).toHaveLength(2);
		const resync = frames[1];
		if (resync?.type !== 'hello') throw new Error('expected resync hello');
		expect(resync.replay.length).toBeGreaterThanOrEqual(120_000);
		// Once the snapshot is acked too, live streaming resumes.
		manager.ack(info.sessionId, attachment, resync.replay.length);
		spawned[0]?.emitData('live');
		await nextFlush();
		expect(frames[2]).toEqual({ data: 'live', type: 'output' });
	});

	test('exit resyncs a desynced attachment before the exit frame', async () => {
		const { manager, spawned } = createManager();
		const info = manager.create();
		const { attachment, frames } = collector();
		manager.attach(info.sessionId, attachment);
		spawned[0]?.emitData('x'.repeat(200_000));
		await nextFlush();
		expect(frames).toHaveLength(0);
		spawned[0]?.emitExit(0);
		expect(frames).toHaveLength(2);
		expect(frames[0]?.type).toBe('hello');
		if (frames[0]?.type === 'hello') {
			expect(frames[0].replay.length).toBeGreaterThanOrEqual(200_000);
		}
		expect(frames[1]).toEqual({ exitCode: 0, type: 'exit' });
	});

	test('ack ignores unknown attachments and nonsense counts', () => {
		const { manager } = createManager();
		const info = manager.create();
		const { attachment, frames } = collector();
		manager.ack(info.sessionId, attachment, 5000);
		manager.attach(info.sessionId, attachment);
		manager.ack(info.sessionId, attachment, Number.NaN);
		manager.ack(info.sessionId, attachment, -50);
		manager.ack('nope', attachment, 5000);
		expect(frames).toHaveLength(0);
	});

	test('kill and disposeAll terminate ptys and clear the registry', () => {
		const { manager, spawned, treeKills } = createManager();
		const info = manager.create();
		expect(manager.kill(info.sessionId)).toBe(true);
		expect(spawned[0]?.killed).toBe(true);
		expect(treeKills).toEqual([spawned[0]?.pid ?? -1]);
		expect(manager.listSessions()).toEqual([]);
		const again = manager.create();
		expect(again.status).toBe('running');
		manager.disposeAll();
		expect(spawned[1]?.killed).toBe(true);
		expect(manager.listSessions()).toEqual([]);
	});
});
