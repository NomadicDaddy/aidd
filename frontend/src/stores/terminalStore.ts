import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { summarizeValue, traceDataMovement } from '../lib/dataMovementTrace.ts';
import { resilientLocalStorage } from './persistStorage.ts';

export const TERMINAL_MIN_HEIGHT_PX = 120;
export const TERMINAL_DEFAULT_HEIGHT_PX = 320;

/** Keep the pane from swallowing the whole viewport when dragged to the top. */
export function clampTerminalHeight(px: number): number {
	const max = Math.round(window.innerHeight * 0.9);
	return Math.min(Math.max(Math.round(px), TERMINAL_MIN_HEIGHT_PX), max);
}

interface TerminalState {
	/** Tab shown in the pane; falls back to the first tab when it no longer exists. */
	activeSessionId: null | string;
	/** Mounted once the pane has been opened at least once; never unmounts after (keeps xterm alive). */
	everOpened: boolean;
	heightPx: number;
	maximized: boolean;
	open: boolean;
	setActiveSessionId: (sessionId: null | string) => void;
	setHeightPx: (px: number) => void;
	setMaximized: (maximized: boolean) => void;
	setOpen: (open: boolean) => void;
	/** Null clears the preference back to the server default (e.g. the stored shell vanished). */
	setShellId: (shellId: null | string) => void;
	/** Persisted shell preference for new tabs; null = server default (first detected shell). */
	shellId: null | string;
	toggleOpen: () => void;
}

export const useTerminalStore = create<TerminalState>()(
	persist(
		(set, get) => ({
			activeSessionId: null,
			everOpened: false,
			heightPx: TERMINAL_DEFAULT_HEIGHT_PX,
			maximized: false,
			open: false,
			setActiveSessionId: (activeSessionId) => set({ activeSessionId }),
			setHeightPx: (px) => set({ heightPx: clampTerminalHeight(px) }),
			setMaximized: (maximized) => set({ maximized }),
			setOpen: (open) => {
				const before = get().open;
				if (before === open) return;
				set({ everOpened: get().everOpened || open, open });
				traceDataMovement({
					category: 'state',
					layer: 'state',
					operation: 'set',
					source: 'terminalStore',
					summary: {
						after: summarizeValue(open),
						before: summarizeValue(before),
						changedKeys: ['open'],
					},
				});
			},
			setShellId: (shellId) => set({ shellId }),
			shellId: null,
			toggleOpen: () => {
				const before = get().open;
				const after = !before;
				set({ everOpened: true, open: after });
				traceDataMovement({
					category: 'state',
					layer: 'state',
					operation: 'toggle',
					source: 'terminalStore',
					summary: {
						after: summarizeValue(after),
						before: summarizeValue(before),
						changedKeys: ['open'],
					},
				});
			},
		}),
		{
			// A persisted open pane must also restore everOpened or the body never mounts.
			merge: (persisted, current) => {
				const merged = { ...current, ...(persisted as Partial<TerminalState>) };
				merged.everOpened = merged.open;
				return merged;
			},
			name: 'aidd-terminal',
			// `maximized` resets each load (reopening maximized is disorienting); `everOpened`
			// resets so a fresh tab doesn't pay the xterm chunk before the pane is used.
			partialize: (state) => ({
				activeSessionId: state.activeSessionId,
				heightPx: state.heightPx,
				open: state.open,
				shellId: state.shellId,
			}),
			storage: createJSONStorage(() => resilientLocalStorage),
		},
	),
);
