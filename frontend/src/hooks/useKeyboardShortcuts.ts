/* eslint-disable react-hooks/refs */
import { useEffect, useRef } from 'react';

import { navigationShortcuts } from '../lib/keyboardShortcuts.ts';

/**
 * Attribute marking the primary search/filter input on a page. The `/` shortcut
 * focuses the first visible element carrying it; pages without search simply
 * omit the marker and `/` falls through to the browser's native behavior.
 */
export const SHORTCUT_SEARCH_ATTR = 'data-shortcut-search';

/** Window (ms) after pressing `g` during which a destination key completes the chord. */
const GO_CHORD_TIMEOUT_MS = 1200;

export interface KeyboardShortcutHandlers {
	/** Navigate to an in-app route (the `g d` / `g p` / `g r` chords). */
	onNavigate: (to: string) => void;
	/** Open the global project directive launcher (the `d` shortcut). */
	onOpenDirective: () => void;
	/** Open the global Director chat capture modal (the `c` shortcut). */
	onOpenDirectorChat: () => void;
	/** Refresh the current page's data (the `r` shortcut). */
	onRefresh: () => void;
	/** Open the shortcuts cheatsheet overlay (the `?` shortcut). */
	onShowShortcuts: () => void;
	/** Toggle the command palette (the Ctrl/Cmd+K shortcut). */
	onTogglePalette: () => void;
	/** Toggle the docked terminal pane (the Ctrl+` shortcut). */
	onToggleTerminal: () => void;
}

/** Destination routes reachable via the `g` go-to chord, keyed by the second key. */
const GO_DESTINATIONS = Object.fromEntries(
	navigationShortcuts.map((shortcut) => [shortcut.keys[1], shortcut.route]),
);

function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	const tag = target.tagName;
	if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
	return target.isContentEditable;
}

/**
 * A modal (command palette, dialog, or this overlay) is open when the app shell
 * has been made `inert` by {@link acquireAppShellInert}. While that holds we
 * suppress global shortcuts so they never double-bind with palette/dialog keys.
 */
function isModalOpen(): boolean {
	if (typeof document === 'undefined') return false;
	return document.getElementById('app-shell')?.hasAttribute('inert') ?? false;
}

export function shouldSuppressGlobalShortcut(editableTarget: boolean, modalOpen: boolean): boolean {
	return editableTarget || modalOpen;
}

function focusPrimarySearch(): boolean {
	if (typeof document === 'undefined') return false;
	const inputs = document.querySelectorAll<HTMLElement>(`[${SHORTCUT_SEARCH_ATTR}]`);
	for (const input of inputs) {
		const visible =
			input.offsetWidth > 0 || input.offsetHeight > 0 || input.getClientRects().length > 0;
		if (visible) {
			input.focus();
			return true;
		}
	}
	return false;
}

/**
 * Centralized global keyboard shortcut layer for the control panel. Mount once
 * at the app shell level (see {@link AppLayout}); the listener lives on
 * `document` and is keyed only by stable callbacks, so it is installed a single
 * time for the app's lifetime.
 *
 * Shortcuts (suppressed while typing in a field or while a modal is open):
 * - `g d` / `g p` / `g r` — go to Dashboard / Projects / Runs
 * - `/` — focus the current page's primary search/filter (when present)
 * - `r` — refresh the current page's data
 * - `d` — open the global project directive launcher
 * - `c` — open the global Director chat capture modal
 * - `?` — open the shortcuts overlay
 * - Ctrl/Cmd+K — toggle the command palette (same exemptions as the terminal toggle)
 * - Ctrl+` — toggle the terminal pane (works even while typing or with a modal open)
 */
export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers): void {
	const handlersRef = useRef(handlers);
	handlersRef.current = handlers;

	useEffect(() => {
		let awaitingGo = false;
		let goTimer: null | ReturnType<typeof setTimeout> = null;

		const clearGo = () => {
			awaitingGo = false;
			if (goTimer !== null) {
				clearTimeout(goTimer);
				goTimer = null;
			}
		};

		const onKeyDown = (event: globalThis.KeyboardEvent) => {
			// Ctrl+` toggles the terminal pane. Checked before the modifier early-return (it IS a
			// Ctrl combo), before isEditableTarget (it must work while the terminal/inputs have
			// focus — the pane's xterm deliberately lets this combo bubble), and before
			// isModalOpen (a toggle, like the palette's own combo). `code` keeps it
			// keyboard-layout independent, matching VS Code.
			if (event.ctrlKey && !event.metaKey && !event.altKey && event.code === 'Backquote') {
				event.preventDefault();
				clearGo();
				handlersRef.current.onToggleTerminal();
				return;
			}
			// Ctrl/Cmd+K toggles the command palette, under the same exemptions as the terminal
			// toggle above. It lives here rather than inside CommandPalette because that surface
			// is code-split and mounted on first open — a listener shipped with it could never
			// fire the open that loads it.
			if ((event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'K')) {
				event.preventDefault();
				clearGo();
				handlersRef.current.onTogglePalette();
				return;
			}
			// Never shadow native or other palette shortcuts that use a command modifier.
			if (event.metaKey || event.ctrlKey || event.altKey) {
				clearGo();
				return;
			}
			if (shouldSuppressGlobalShortcut(isEditableTarget(event.target), isModalOpen())) {
				clearGo();
				return;
			}

			const key = event.key.toLowerCase();

			if (awaitingGo) {
				const destination = GO_DESTINATIONS[key];
				clearGo();
				if (destination) {
					event.preventDefault();
					handlersRef.current.onNavigate(destination);
				}
				return;
			}

			if (key === 'g') {
				awaitingGo = true;
				goTimer = setTimeout(clearGo, GO_CHORD_TIMEOUT_MS);
				return;
			}

			if (event.key === '?') {
				event.preventDefault();
				handlersRef.current.onShowShortcuts();
				return;
			}

			if (key === '/') {
				// Only swallow the keypress when there is a search field to focus,
				// so the browser's native quick-find still works on pages without one.
				if (focusPrimarySearch()) event.preventDefault();
				return;
			}

			if (key === 'r') {
				event.preventDefault();
				handlersRef.current.onRefresh();
				return;
			}

			if (key === 'c') {
				event.preventDefault();
				handlersRef.current.onOpenDirectorChat();
				return;
			}

			if (key === 'd') {
				event.preventDefault();
				handlersRef.current.onOpenDirective();
			}
		};

		document.addEventListener('keydown', onKeyDown);
		return () => {
			clearGo();
			document.removeEventListener('keydown', onKeyDown);
		};
	}, []);
}
