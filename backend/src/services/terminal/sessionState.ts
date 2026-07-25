import type {
	DetectedShell,
	TerminalServerFrame,
	TerminalSessionInfo,
	WindowsPtyHint,
} from 'aidd-shared/contracts/terminal';

import { release } from 'node:os';

import type { PtyHandle } from './ptyProvider.ts';
import type { ScrollbackMirror } from './scrollbackMirror.ts';

/** A connected terminal socket; the manager fans PTY output out to every attachment. */
export interface TerminalAttachment {
	send(frame: TerminalServerFrame): void;
}

/**
 * Output coalescing window. Much shorter than the run tail watcher's 120ms debounce because this
 * path echoes keystrokes — latency above ~16ms is visible when typing — while still collapsing
 * fast producers (a directory listing, a build) into a sane frame rate.
 */
export const OUTPUT_FLUSH_MS = 10;

export const DEFAULT_COLS = 80;
export const DEFAULT_ROWS = 24;

/** Cap on concurrently running shells — a tab-strip sanity bound, not a resource quota. */
export const MAX_RUNNING_SESSIONS = 8;

/**
 * Flow-control watermarks (VS Code's terminal constants). The client acks chars as its terminal
 * finishes parsing them; an attachment more than HIGH_WATERMARK_CHARS behind stops receiving live
 * output (bun-pty exposes no PTY pause, but scrollback keeps accumulating under its own cap) and
 * is resynced with a fresh scrollback snapshot once its acks drain below LOW_WATERMARK_CHARS.
 */
export const HIGH_WATERMARK_CHARS = 100_000;
export const LOW_WATERMARK_CHARS = 5_000;

export interface AttachmentFlowState {
	/** True once output was dropped for this attachment; cleared by the resync snapshot. */
	desynced: boolean;
	/** Chars sent to this attachment that its terminal has not yet acked as parsed. */
	unackedChars: number;
}

/**
 * bun-pty drives ConPTY on Windows, so every session there needs xterm's ConPTY heuristics.
 * buildNumber gates which heuristics apply; an unparseable release falls back to 0 (oldest-ConPTY
 * behavior — reflow stays disabled rather than guessing).
 */
const windowsPtyHint: null | WindowsPtyHint =
	process.platform === 'win32'
		? { backend: 'conpty', buildNumber: Number(release().split('.')[2]) || 0 }
		: null;

export interface TerminalSession {
	attachments: Map<TerminalAttachment, AttachmentFlowState>;
	cols: number;
	createdAt: string;
	cwd: string;
	exitCode: null | number;
	flushTimer: null | ReturnType<typeof setTimeout>;
	mirror: ScrollbackMirror;
	pendingOutput: string;
	pty: null | PtyHandle;
	rows: number;
	sessionId: string;
	shell: DetectedShell;
	status: 'exited' | 'running';
}

/**
 * Builds the attach/resync frame for a session: the serialized screen snapshot plus the geometry
 * and platform hints the client needs before parsing it.
 * @param session - The session to snapshot.
 * @returns The hello frame to send to one attachment.
 */
export function buildHello(
	session: TerminalSession,
): Extract<TerminalServerFrame, { type: 'hello' }> {
	return {
		cols: session.cols,
		replay: session.mirror.snapshot(),
		rows: session.rows,
		sessionId: session.sessionId,
		shellId: session.shell.id,
		type: 'hello',
		windowsPty: windowsPtyHint,
	};
}

/**
 * Projects a session onto its REST-facing snapshot shape.
 * @param session - The session to describe.
 * @returns The session info returned by the terminal endpoints.
 */
export function toInfo(session: TerminalSession): TerminalSessionInfo {
	return {
		cols: session.cols,
		createdAt: session.createdAt,
		cwd: session.cwd,
		exitCode: session.exitCode,
		rows: session.rows,
		sessionId: session.sessionId,
		shellId: session.shell.id,
		status: session.status,
	};
}
