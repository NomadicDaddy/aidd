import { SerializeAddon } from '@xterm/addon-serialize';
import { Terminal } from '@xterm/headless';

/**
 * Server-side mirror of a session's screen state: a headless xterm fed the same bytes as every
 * client. Snapshots serialize the final buffer state (cells, colors, cursor, modes) instead of
 * replaying raw history — overwritten frames (progress bars, TUI redraws) collapse to their end
 * state, and replay cost is bounded by the scrollback window rather than lifetime output volume.
 */
export interface ScrollbackMirror {
	dispose(): void;
	resize(cols: number, rows: number): void;
	/** Serialized snapshot; bytes still queued in the parser are appended raw so nothing is lost. */
	snapshot(): string;
	write(data: string): void;
}

/** Matches the pane's client-side xterm scrollback so both ends retain the same history depth. */
const MIRROR_SCROLLBACK_LINES = 5000;

/**
 * Creates the headless mirror for one PTY session. Confines `@xterm/headless` and
 * `@xterm/addon-serialize` to this file, mirroring how `ptyProvider.ts` confines `bun-pty`.
 * @param cols - Initial column count (kept in sync with the PTY via resize()).
 * @param rows - Initial row count.
 * @returns The mirror handle owned by the session manager.
 */
export function createScrollbackMirror(cols: number, rows: number): ScrollbackMirror {
	const term = new Terminal({
		allowProposedApi: true,
		cols,
		rows,
		scrollback: MIRROR_SCROLLBACK_LINES,
	});
	const serialize = new SerializeAddon();
	// The serialize addon types against the browser build's Terminal; the headless Terminal is
	// the same implementation minus the renderer, which serialize never touches.
	term.loadAddon(serialize as unknown as Parameters<Terminal['loadAddon']>[0]);
	// xterm parses writes asynchronously; track bytes not yet parsed so snapshot() can append
	// them raw. Write callbacks fire in submission order, so trimming the front stays aligned.
	let unparsed = '';
	return {
		dispose: () => term.dispose(),
		resize: (nextCols, nextRows) => term.resize(nextCols, nextRows),
		snapshot: () => serialize.serialize() + unparsed,
		write: (data) => {
			unparsed += data;
			term.write(data, () => {
				unparsed = unparsed.slice(data.length);
			});
		},
	};
}
