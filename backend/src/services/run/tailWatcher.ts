import { type FSWatcher, watch } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';

import type { WebSocketHub } from '../../webSocketHub.ts';

import { webLogger } from '../../logger.ts';

// Reads are debounced and the bytes pulled within a single drain are concatenated into one
// WebSocket frame. At 120ms a continuously-writing run broadcasts at most ~8 frames/sec
// instead of one per filesystem event, which is what kept the single-threaded broadcast loop
// (webSocketHub.broadcast) from starving HTTP handling during an audit fan-out of many runs.
const TAIL_DEBOUNCE_MS = 120;

// Reliability floor for fs.watch. On Windows/NTFS the CLI appends the run log through one
// persistent file handle, and directory metadata (size/mtime) is not updated until that handle
// closes or another process opens the file — so ReadDirectoryChangesW-backed fs.watch delivers
// no events for the entire run. The observable symptom was a frozen live console that emitted
// exactly one chunk whenever the /output route's read happened to flush the metadata. Polling
// notices growth regardless of directory staleness because readNewBytes fstats the open read
// handle (true end-of-file), not the path.
const TAIL_POLL_MS = 500;

// Per-run log tail: opens the runId-deterministic log file written by the detached CLI
// heartbeat (via scrubSecrets at write time) and broadcasts new bytes over the WebSocket
// hub. The CLI conflates stderr into the same file, so every chunk is broadcast as
// 'stdout' — the wire protocol still requires a stream tag.
export class RunTailWatcher {
	private readonly hub: WebSocketHub;
	private readonly runId: string;
	private debounceTimer: null | ReturnType<typeof setTimeout> = null;
	private handle: FileHandle | null = null;
	private offset = 0;
	private pending = '';
	private pollTimer: null | ReturnType<typeof setInterval> = null;
	private reading = false;
	private rereadPending = false;
	private stopped = false;
	private watcher: FSWatcher | null = null;

	private constructor(runId: string, hub: WebSocketHub) {
		this.runId = runId;
		this.hub = hub;
	}

	static async start(
		runId: string,
		logPath: string,
		hub: WebSocketHub,
		options: { pollMs?: number } = {}
	): Promise<RunTailWatcher> {
		const tail = new RunTailWatcher(runId, hub);
		try {
			tail.handle = await open(logPath, 'r');
		} catch (err) {
			webLogger.warn({ err, logPath, runId }, 'RunTailWatcher: failed to open log');
		}
		try {
			tail.watcher = watch(logPath, { persistent: false }, () => tail.scheduleRead());
			tail.watcher.on('error', (err: unknown) =>
				webLogger.warn({ err, runId }, 'RunTailWatcher: fs.watch error')
			);
		} catch (err) {
			webLogger.warn({ err, logPath, runId }, 'RunTailWatcher: fs.watch unavailable');
		}
		// Always poll alongside fs.watch: the watch path gives low latency where it works, the
		// poll guarantees progress where it silently doesn't (see TAIL_POLL_MS).
		tail.pollTimer = setInterval(() => tail.scheduleRead(), options.pollMs ?? TAIL_POLL_MS);
		tail.pollTimer.unref?.();
		await tail.drain();
		return tail;
	}

	async stop(): Promise<void> {
		this.stopped = true;
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
		this.watcher?.close();
		this.watcher = null;
		await this.drain();
		this.flush();
		await this.handle?.close().catch(() => {});
		this.handle = null;
	}

	private scheduleRead(): void {
		if (this.stopped) return;
		if (this.debounceTimer) return;
		this.debounceTimer = setTimeout(() => {
			this.debounceTimer = null;
			void this.drain();
		}, TAIL_DEBOUNCE_MS);
	}

	private async drain(): Promise<void> {
		if (this.reading) {
			this.rereadPending = true;
			return;
		}
		this.reading = true;
		try {
			do {
				this.rereadPending = false;
				await this.readNewBytes();
			} while (this.rereadPending && !this.stopped);
		} finally {
			this.reading = false;
		}
		// One coalesced frame per drain: all bytes read across the loop above (and across the
		// 120ms debounce window) ship as a single broadcast instead of one per read.
		this.flush();
	}

	// Emit the accumulated bytes as one run_output frame. The frontend appends chunk text, so
	// concatenation is transparent on the wire.
	private flush(): void {
		if (this.pending.length === 0) return;
		const chunk = this.pending;
		this.pending = '';
		this.hub.broadcast({
			payload: { chunk, stream: 'stdout' },
			runId: this.runId,
			type: 'run_output',
		});
	}

	private async readNewBytes(): Promise<void> {
		if (!this.handle) return;
		let size: number;
		try {
			// fstat on the open handle, never stat on the path: while the CLI's writer handle is
			// open, the path-stat can report the stale directory-entry size on Windows and hide
			// appended bytes from the poll.
			size = (await this.handle.stat()).size;
		} catch {
			return;
		}
		if (size <= this.offset) return;
		const length = size - this.offset;
		const buffer = Buffer.alloc(length);
		const { bytesRead } = await this.handle.read(buffer, 0, length, this.offset);
		if (bytesRead === 0) return;
		this.offset += bytesRead;
		this.pending += buffer.subarray(0, bytesRead).toString('utf8');
	}
}
