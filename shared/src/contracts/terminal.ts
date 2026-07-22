/**
 * The embedded-terminal contract — the message shapes exchanged between the web client's terminal
 * pane and the backend PTY session endpoint (`/api/v1/terminal/*` REST + `/api/v1/terminal/ws`).
 *
 * This is deliberately separate from the broadcast union in `websocket.ts`: that union fans out to
 * every connected client and is exhaustively switched by the realtime-invalidation handler, whereas
 * terminal frames are bidirectional and scoped to a single attached connection. Mixing the two
 * would force every terminal keystroke through the exhaustive-broadcast machinery for no benefit.
 */

/** A shell executable detected on the backend host, offered in the terminal pane's picker. */
export interface DetectedShell {
	args: string[];
	id: string;
	label: string;
	path: string;
}

export type TerminalSessionStatus = 'exited' | 'running';

/** Snapshot of a PTY session's identity and state, returned by the terminal REST endpoints. */
export interface TerminalSessionInfo {
	cols: number;
	createdAt: string;
	/** Directory the shell was started in (a tab label/tooltip; the shell may cd away freely). */
	cwd: string;
	exitCode: null | number;
	rows: number;
	sessionId: string;
	shellId: string;
	status: TerminalSessionStatus;
}

/**
 * Frames the client sends over the terminal socket. `ack` reports chars the client's terminal has
 * finished parsing (not merely received) — the server's flow control gates output on it.
 */
export type TerminalClientFrame =
	| { chars: number; type: 'ack' }
	| { cols: number; rows: number; type: 'resize' }
	| { data: string; type: 'input' }
	| { type: 'ping' };

export type TerminalErrorCode = 'pty-unavailable' | 'session-not-found' | 'spawn-failed';

/**
 * Host PTY emulation hint mirrored into xterm.js's `windowsPty` option, which enables its ConPTY
 * quirk heuristics (wrapped-line detection, reflow behavior). Null on POSIX hosts.
 */
export interface WindowsPtyHint {
	backend: 'conpty';
	buildNumber: number;
}

/**
 * Frames the server sends over the terminal socket. `hello` (carrying the scrollback replay) is
 * always the first frame after attach, before any live `output` for that connection. It is also
 * re-sent mid-connection as a resync snapshot when flow control had to drop output for a slow
 * consumer — the client handles both identically (reset, then write the replay).
 */
export type TerminalServerFrame =
	| { code: TerminalErrorCode; message: string; type: 'error' }
	| {
			cols: number;
			replay: string;
			rows: number;
			sessionId: string;
			shellId: string;
			type: 'hello';
			windowsPty: null | WindowsPtyHint;
	  }
	| { data: string; type: 'output' }
	| { exitCode: null | number; type: 'exit' }
	| { type: 'pong' };
