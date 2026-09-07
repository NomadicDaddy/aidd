import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { summarizeValue, traceDataMovement } from '../lib/dataMovementTrace.ts';
import { resilientLocalStorage } from './persistStorage.ts';

interface SidebarState {
	collapsed: boolean;
	/** Re-applies `defaultCollapsedForWidth` unless the user has made the choice themselves. */
	syncToViewport: (width: number) => void;
	toggle: () => void;
	/**
	 * Whether the persisted `collapsed` is a decision or a leftover default.
	 *
	 * Absent from state persisted before this existed, which reads back as `false` — the right
	 * answer, because those entries are exactly the stale first-load defaults this distinguishes.
	 */
	userChosen: boolean;
}

/** Below this the labelled rail costs 240px of a viewport that has none to spare. */
const labelledRailMinWidth = 1024;

/**
 * The rail state a viewport of this width should open on, absent a decision from the user.
 *
 * At 768x1024 the expanded rail spends a quarter of the width on labels the glyphs already carry,
 * so a tablet opens on the icon rail. The cost of getting this wrong is not cosmetic: the expanded
 * rail takes 264px off the left of `main`, so a 768px viewport holding it open has a 480px content
 * column — narrower than the same page at 640px with the rail collapsed. See the content-width
 * table in `AppLayout.tsx`.
 *
 * This is consulted on every viewport crossing, not only at first load, because a window that is
 * resized down — or a persisted entry written at desk width and rehydrated on a phone — otherwise
 * keeps an expanded rail the viewport cannot afford. A deliberate toggle sets `userChosen` and is
 * never overridden.
 */
export function defaultCollapsedForWidth(width: number): boolean {
	return width < labelledRailMinWidth;
}

export const useSidebarStore = create<SidebarState>()(
	persist(
		(set, get) => ({
			collapsed:
				typeof window === 'undefined' ? false : defaultCollapsedForWidth(window.innerWidth),
			syncToViewport: (width: number) => {
				const state = get();
				if (state.userChosen) return;
				const next = defaultCollapsedForWidth(width);
				if (next === state.collapsed) return;
				set({ collapsed: next });
			},
			toggle: () => {
				const before = get().collapsed;
				const after = !before;
				set({ collapsed: after, userChosen: true });
				traceDataMovement({
					category: 'state',
					layer: 'state',
					operation: 'toggle',
					source: 'sidebarStore',
					summary: {
						after: summarizeValue(after),
						before: summarizeValue(before),
						changedKeys: ['collapsed', 'userChosen'],
					},
				});
			},
			userChosen: false,
		}),
		{
			name: 'aidd-sidebar',
			// Rehydration is the case the first-load default cannot cover: the stored value was
			// written at whatever width the last visit had. Re-deriving it here is what stops a
			// desk-width entry from opening the rail on a phone.
			onRehydrateStorage: () => (state) => {
				if (typeof window === 'undefined') return;
				state?.syncToViewport(window.innerWidth);
			},
			storage: createJSONStorage(() => resilientLocalStorage),
		},
	),
);

// Subscribed here rather than in a component effect: the rail is app-wide, the store outlives every
// mount, and one module-scope listener cannot be double-registered by a remount. `matchMedia` fires
// only on the crossing itself, so this costs nothing during a drag that stays on one side of it.
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
	window
		.matchMedia(`(min-width: ${labelledRailMinWidth}px)`)
		.addEventListener('change', (event) => {
			useSidebarStore.getState().syncToViewport(event.matches ? labelledRailMinWidth : 0);
		});
}
