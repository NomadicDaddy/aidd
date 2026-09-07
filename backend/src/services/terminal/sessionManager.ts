import type {
	DetectedShell,
	TerminalServerFrame,
	TerminalSessionInfo,
} from 'aidd-shared/contracts/terminal';

import { killProcessTree } from 'aidd-shared/lib/processTree';
import { statSync } from 'node:fs';

import type { PtySpawn } from './ptyProvider.ts';
import type { TerminalAttachment, TerminalSession } from './sessionState.ts';

import { webLogger } from '../../logger.ts';
import { createScrollbackMirror } from './scrollbackMirror.ts';
import {
	broadcastSessionFrame,
	flushSessionOutput,
	queueSessionOutput,
	resyncSessionAttachments,
	sendSessionFrame,
} from './sessionOutput.ts';
import {
	buildHello,
	DEFAULT_COLS,
	DEFAULT_ROWS,
	LOW_WATERMARK_CHARS,
	MAX_RUNNING_SESSIONS,
	toInfo,
} from './sessionState.ts';

export type { TerminalAttachment } from './sessionState.ts';

export interface TerminalSessionManagerOptions {
	/** Process-tree sweeper; injectable so unit tests never taskkill a real pid. */
	killTree?: (pid: number) => Promise<void>;
	listShells: () => DetectedShell[];
	rootDir: string;
	spawnPty: null | PtySpawn;
}

/**
 * Owns the backend PTY sessions behind the embedded terminal pane. Sessions are in-memory only
 * (no DB) and persistent: detaching every socket leaves the shell running, so closing or reloading
 * the pane reattaches with scrollback replayed. Sessions end only via {@link kill}, shell exit, or
 * {@link disposeAll} at backend shutdown — a PTY must never outlive this process.
 */
export class TerminalSessionManager {
	private readonly options: TerminalSessionManagerOptions;
	private readonly sessions = new Map<string, TerminalSession>();

	constructor(options: TerminalSessionManagerOptions) {
		this.options = options;
	}

	get available(): boolean {
		return this.options.spawnPty !== null;
	}

	listShells(): DetectedShell[] {
		return this.options.listShells();
	}

	listSessions(): TerminalSessionInfo[] {
		return [...this.sessions.values()].map((session) => toInfo(session));
	}

	/**
	 * Spawns a new PTY session (one per tab; sessions are independent).
	 * @param options - Spawn options.
	 * @param options.cwd - Working directory; must exist and be a directory. Omitted = backend root.
	 * @param options.shellId - Shell id from the detected list. Omitted = the default (first) shell.
	 * @returns The new session's info snapshot.
	 */
	create(options: { cwd?: string; shellId?: string } = {}): TerminalSessionInfo {
		const spawnPty = this.options.spawnPty;
		if (!spawnPty) throw new TerminalUnavailableError();
		const running = [...this.sessions.values()].filter((s) => s.status === 'running');
		if (running.length >= MAX_RUNNING_SESSIONS) {
			throw new TerminalLimitError(`session limit reached (${MAX_RUNNING_SESSIONS})`);
		}
		const shells = this.listShells();
		const shell = options.shellId
			? shells.find((entry) => entry.id === options.shellId)
			: shells[0];
		if (!shell) {
			throw new TerminalSpawnError(`unknown shell: ${options.shellId ?? '(none detected)'}`);
		}
		const cwd = options.cwd ?? this.options.rootDir;
		if (!statSync(cwd, { throwIfNoEntry: false })?.isDirectory()) {
			throw new TerminalSpawnError(`not a directory: ${cwd}`);
		}
		const session: TerminalSession = {
			attachments: new Map(),
			cols: DEFAULT_COLS,
			createdAt: new Date().toISOString(),
			cwd,
			exitCode: null,
			flushTimer: null,
			mirror: createScrollbackMirror(DEFAULT_COLS, DEFAULT_ROWS),
			pendingOutput: '',
			pty: null,
			rows: DEFAULT_ROWS,
			sessionId: crypto.randomUUID(),
			shell,
			status: 'running',
		};
		try {
			// Full-environment pass-through is deliberate, unlike aidd-managed tool/CLI
			// subprocesses (buildBackendSubprocessEnv allowlist): this PTY IS the user's own
			// interactive shell and must behave exactly like one they opened themselves.
			session.pty = spawnPty(shell.path, shell.args, {
				cols: session.cols,
				cwd: session.cwd,
				env: { ...process.env } as Record<string, string>, // allow-env-spread-policy
				rows: session.rows,
			});
		} catch (err) {
			session.mirror.dispose();
			webLogger.warn({ err, shell: shell.id }, 'terminal shell spawn failed');
			throw new TerminalSpawnError(`failed to spawn ${shell.label}`);
		}
		session.pty.onData((data) => this.handleOutput(session, data));
		session.pty.onExit((event) => this.handleExit(session, event.exitCode));
		this.sessions.set(session.sessionId, session);
		webLogger.info(
			{ pid: session.pty.pid, sessionId: session.sessionId, shell: shell.id },
			'terminal session started',
		);
		return toInfo(session);
	}

	/**
	 * Attaches a socket to a session.
	 * @param sessionId - Target session id (from get-or-create).
	 * @param attachment - Per-connection sender that will receive every subsequent frame.
	 * @returns The hello frame (with scrollback replay) to send first, or null when unknown.
	 */
	attach(sessionId: string, attachment: TerminalAttachment): null | TerminalServerFrame {
		const session = this.sessions.get(sessionId);
		if (!session) return null;
		const hello = buildHello(session);
		// The replay counts as unacked: the client acks it once parsed, like any output.
		session.attachments.set(attachment, { desynced: false, unackedChars: hello.replay.length });
		return hello;
	}

	/**
	 * Client flow-control acknowledgement. A desynced attachment that drains below the low
	 * watermark gets a fresh hello snapshot — dropped output is not resent piecemeal; the
	 * scrollback replay supersedes it.
	 * @param sessionId - Target session id.
	 * @param attachment - The attachment (connection) the ack arrived on.
	 * @param chars - Chars the attachment's terminal has finished parsing since its last ack.
	 */
	ack(sessionId: string, attachment: TerminalAttachment, chars: number): void {
		const session = this.sessions.get(sessionId);
		const flow = session?.attachments.get(attachment);
		if (!session || !flow || !Number.isFinite(chars) || chars <= 0) return;
		flow.unackedChars = Math.max(0, flow.unackedChars - Math.floor(chars));
		if (flow.desynced && flow.unackedChars <= LOW_WATERMARK_CHARS) {
			const hello = buildHello(session);
			flow.desynced = false;
			flow.unackedChars = hello.replay.length;
			sendSessionFrame(session, attachment, hello);
		}
	}

	detach(sessionId: string, attachment: TerminalAttachment): void {
		this.sessions.get(sessionId)?.attachments.delete(attachment);
	}

	write(sessionId: string, data: string): void {
		const session = this.sessions.get(sessionId);
		if (session?.status === 'running') session.pty?.write(data);
	}

	/**
	 * Resize is last-writer-wins across attachments; the PTY reflows to the newest geometry.
	 * @param sessionId - Target session id.
	 * @param cols - Requested column count (clamped; non-integer/tiny values ignored).
	 * @param rows - Requested row count (clamped; non-integer/tiny values ignored).
	 */
	resize(sessionId: string, cols: number, rows: number): void {
		const session = this.sessions.get(sessionId);
		if (!session || session.status !== 'running') return;
		if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 2) return;
		session.cols = Math.min(cols, 500);
		session.rows = Math.min(rows, 300);
		session.pty?.resize(session.cols, session.rows);
		session.mirror.resize(session.cols, session.rows);
	}

	kill(sessionId: string): boolean {
		const session = this.sessions.get(sessionId);
		if (!session) return false;
		this.terminate(session);
		session.mirror.dispose();
		this.sessions.delete(sessionId);
		return true;
	}

	/** Backend shutdown hook: every PTY dies with this process. */
	disposeAll(): void {
		for (const session of this.sessions.values()) {
			this.terminate(session);
			session.mirror.dispose();
		}
		this.sessions.clear();
	}

	private terminate(session: TerminalSession): void {
		if (session.flushTimer) {
			clearTimeout(session.flushTimer);
			session.flushTimer = null;
		}
		if (session.status !== 'running' || !session.pty) return;
		session.status = 'exited';
		const pid = session.pty.pid;
		try {
			session.pty.kill();
		} catch (err) {
			webLogger.warn({ err, sessionId: session.sessionId }, 'terminal pty kill failed');
		}
		// ConPTY kill usually cascades to the shell's children, but cmd/pwsh child trees can
		// linger on Windows — sweep the tree as a fallback. Fire-and-forget: shutdown must not
		// block on a stubborn descendant.
		const killTree = this.options.killTree ?? killProcessTree;
		void killTree(pid).catch(() => {});
	}

	private handleOutput(session: TerminalSession, data: string): void {
		queueSessionOutput(session, data);
	}

	private handleExit(session: TerminalSession, exitCode: number): void {
		if (session.status === 'exited') return;
		session.status = 'exited';
		session.exitCode = exitCode;
		if (session.flushTimer) {
			clearTimeout(session.flushTimer);
			session.flushTimer = null;
		}
		flushSessionOutput(session);
		// A desynced attachment would otherwise see the exit banner without the final output —
		// snapshot it back to reality first.
		resyncSessionAttachments(session);
		broadcastSessionFrame(session, { exitCode, type: 'exit' });
		webLogger.info({ exitCode, sessionId: session.sessionId }, 'terminal session exited');
	}
}

export class TerminalUnavailableError extends Error {
	constructor() {
		super('terminal support unavailable on this host');
	}
}

export class TerminalSpawnError extends Error {}

export class TerminalLimitError extends Error {}
