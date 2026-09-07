import type { TerminalServerFrame } from 'aidd-shared/contracts/terminal';

import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { cn } from '../../lib/cn.ts';
import { toneBorder, toneSurface, toneSurfaceHover, toneText } from '../../lib/tones.ts';
import { useTerminalStore } from '../../stores/terminalStore.ts';
import { TerminalFindBar } from './TerminalFindBar.tsx';
import {
	sendTerminalAck,
	sendTerminalInput,
	sendTerminalResizeIfChanged,
	subscribeTerminalFrames,
	subscribeTerminalSocketOpen,
} from './terminalState.ts';
import { useXtermTheme } from './xtermTheme.ts';

import '@xterm/xterm/css/xterm.css';

const FIT_DEBOUNCE_MS = 50;

/**
 * Flow-control ack granularity; must stay at or below the server's low watermark or a desynced
 * attachment never drains enough to be resynced.
 */
const ACK_CHARS = 5000;

/**
 * One tab's xterm host. Mounts when its session appears and stays mounted (hidden) while other
 * tabs are active, so each tab's scrollback and cursor state survive switching instantly.
 */
export function TerminalTabView({ active, sessionId }: { active: boolean; sessionId: string }) {
	const open = useTerminalStore((state) => state.open);
	const maximized = useTerminalStore((state) => state.maximized);
	const heightPx = useTerminalStore((state) => state.heightPx);
	const theme = useXtermTheme();
	const hostRef = useRef<HTMLDivElement | null>(null);
	const termRef = useRef<null | Terminal>(null);
	const fitRef = useRef<FitAddon | null>(null);
	const searchRef = useRef<null | SearchAddon>(null);
	const lastSentSize = useRef<{ cols: number; rows: number } | null>(null);
	const pendingAckChars = useRef(0);
	const [findOpen, setFindOpen] = useState(false);
	/** Multi-line clipboard text held until the user confirms the paste (or the shell brackets it). */
	const [pendingPaste, setPendingPaste] = useState<null | string>(null);

	// Ack from xterm's write callback so backpressure reflects real parse throughput, not just
	// socket delivery — the callback fires only after the chunk has been consumed by the parser.
	const writeAcked = useEffectEvent((data: string) => {
		termRef.current?.write(data, () => {
			pendingAckChars.current += data.length;
			if (pendingAckChars.current >= ACK_CHARS) {
				sendTerminalAck(sessionId, pendingAckChars.current);
				pendingAckChars.current = 0;
			}
		});
	});

	const fitAndReport = useEffectEvent(() => {
		const term = termRef.current;
		const fit = fitRef.current;
		const host = hostRef.current;
		// fit() on a hidden (display:none) host computes garbage geometry — only measure when laid out.
		if (!term || !fit || !host || host.clientWidth === 0 || host.clientHeight === 0) return;
		fit.fit();
		const size = { cols: term.cols, rows: term.rows };
		lastSentSize.current = sendTerminalResizeIfChanged(sessionId, size, lastSentSize.current);
	});

	// Create the Terminal once per tab. StrictMode double-invokes effects in dev; the cleanup
	// disposes the first instance so the second mount starts clean (the hello replay repopulates it).
	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		const term = new Terminal({
			cursorBlink: true,
			fontFamily: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
			fontSize: 13,
			scrollback: 5000,
		});
		const fit = new FitAddon();
		term.loadAddon(fit);
		term.loadAddon(new WebLinksAddon());
		const search = new SearchAddon();
		term.loadAddon(search);
		term.open(host);
		// GPU rendering when the browser gives us a WebGL2 context; on failure (or a later context
		// loss) dispose the addon and xterm reverts to its DOM renderer — VS Code's exact fallback.
		try {
			const webgl = new WebglAddon();
			webgl.onContextLoss(() => webgl.dispose());
			term.loadAddon(webgl);
		} catch {
			// No WebGL2 on this host/browser; the DOM renderer is already active.
		}
		term.onData((data) => sendTerminalInput(sessionId, data));
		term.attachCustomKeyEventHandler((event) => {
			// Let Ctrl+` bubble to the document-level shortcut listener so it toggles the pane
			// even while the terminal has focus.
			if (event.ctrlKey && !event.metaKey && !event.altKey && event.code === 'Backquote') {
				return false;
			}
			// Ctrl+F opens the pane's own find bar (the browser's find can't see xterm's buffer).
			if (
				event.type === 'keydown' &&
				event.ctrlKey &&
				!event.metaKey &&
				!event.altKey &&
				!event.shiftKey &&
				event.code === 'KeyF'
			) {
				event.preventDefault();
				setFindOpen(true);
				return false;
			}
			return true;
		});
		// Intercept paste ahead of xterm's own textarea handler (capture phase on the host, an
		// ancestor of the textarea) so multi-line pastes can be confirmed before they reach a
		// shell that would run each line eagerly. Bracketed paste mode makes the guard redundant —
		// the shell receives the paste wrapped and inert — so it passes straight through.
		const onPaste = (event: ClipboardEvent) => {
			const text = event.clipboardData?.getData('text');
			event.preventDefault();
			event.stopPropagation();
			if (!text) return;
			if (/[\r\n]/.test(text) && !term.modes.bracketedPasteMode) {
				setPendingPaste(text);
				return;
			}
			term.paste(text);
		};
		host.addEventListener('paste', onPaste, true);
		termRef.current = term;
		fitRef.current = fit;
		searchRef.current = search;
		return () => {
			host.removeEventListener('paste', onPaste, true);
			termRef.current = null;
			fitRef.current = null;
			searchRef.current = null;
			term.dispose();
		};
	}, [sessionId]);

	// A fit can precede the first handshake, and reconnects invalidate what the new socket's PTY has
	// observed. Retry the current geometry on every open and only cache it after a successful send.
	useEffect(
		() =>
			subscribeTerminalSocketOpen(sessionId, () => {
				lastSentSize.current = null;
				fitAndReport();
			}),
		[sessionId],
	);

	// Server frames for this tab's session.
	useEffect(() => {
		const onFrame = (frame: TerminalServerFrame) => {
			const term = termRef.current;
			if (!term) return;
			if (frame.type === 'hello') {
				// ConPTY hosts need xterm's Windows heuristics (wrapped-line detection, reflow
				// deferral); must be set before any output is parsed to apply to the replay too.
				term.options.windowsPty = frame.windowsPty ?? {};
				// Reset before replay so a reconnect doesn't append a second copy of the scrollback.
				term.reset();
				// Discard the ack tally from before the snapshot — the server counts the replay
				// afresh for this attachment, and only chars parsed from here on may be acked.
				pendingAckChars.current = 0;
				writeAcked(frame.replay);
				fitAndReport();
			} else if (frame.type === 'output') {
				writeAcked(frame.data);
			} else if (frame.type === 'exit') {
				term.write(
					`\r\n\x1b[2m[session ended${frame.exitCode === null ? '' : ` with code ${frame.exitCode}`} — restart from the header]\x1b[0m\r\n`,
				);
			} else if (frame.type === 'error') {
				term.write(`\r\n\x1b[31m[${frame.message}]\x1b[0m\r\n`);
			}
		};
		return subscribeTerminalFrames(sessionId, onFrame);
	}, [sessionId]);

	// Refit whenever the host box changes (drag-resize, maximize, sidebar collapse, window resize).
	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		let timer: null | ReturnType<typeof setTimeout> = null;
		const observer = new ResizeObserver(() => {
			timer ??= setTimeout(() => {
				timer = null;
				fitAndReport();
			}, FIT_DEBOUNCE_MS);
		});
		observer.observe(host);
		return () => {
			observer.disconnect();
			if (timer !== null) clearTimeout(timer);
		};
	}, []);

	// Tabs hide via display:none, so ResizeObserver alone misses the reveal on some browsers;
	// fit + focus explicitly whenever this tab becomes the visible one or its box changes.
	useEffect(() => {
		if (!open || !active) return;
		fitAndReport();
		termRef.current?.focus();
	}, [open, active, maximized, heightPx]);

	useEffect(() => {
		const term = termRef.current;
		if (term) term.options.theme = theme;
	}, [theme]);

	const closeFind = () => {
		setFindOpen(false);
		searchRef.current?.clearDecorations();
		termRef.current?.focus();
	};

	const resolvePaste = (text: null | string) => {
		if (text !== null) termRef.current?.paste(text);
		setPendingPaste(null);
		termRef.current?.focus();
	};

	const pasteLineCount = pendingPaste === null ? 0 : pendingPaste.split(/\r\n|[\n\r]/).length;

	return (
		<div
			className={active ? 'relative h-full min-h-0' : 'hidden'}
			style={{ background: theme.background }}>
			{findOpen && (
				<TerminalFindBar
					onClose={closeFind}
					onFind={(query, direction) => {
						const search = searchRef.current;
						if (!search || !query) return;
						if (direction === 'previous') search.findPrevious(query);
						else search.findNext(query, { incremental: direction === 'incremental' });
					}}
				/>
			)}
			{pendingPaste !== null && (
				<div
					className={cn(
						'absolute inset-x-0 top-0 z-10 flex items-center gap-2 border-b px-3 py-1.5 text-xs',
						toneBorder.amber,
						toneSurface.amber,
						toneText.amber,
					)}>
					<span>
						Paste {pasteLineCount} lines? Each line may run as a separate command.
					</span>
					<button
						autoFocus
						className={cn(
							'rounded border border-current/60 px-2 py-0.5 font-medium',
							toneSurfaceHover.amber,
						)}
						onClick={() => resolvePaste(pendingPaste)}
						onKeyDown={(event) => {
							if (event.key === 'Escape') resolvePaste(null);
						}}
						type="button">
						Paste
					</button>
					<button
						className={cn('rounded px-2 py-0.5', toneSurfaceHover.amber)}
						onClick={() => resolvePaste(null)}
						type="button">
						Cancel
					</button>
				</div>
			)}
			<div className="h-full pl-2" ref={hostRef} />
		</div>
	);
}
