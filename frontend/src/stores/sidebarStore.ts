import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { summarizeValue, traceDataMovement } from '../lib/dataMovementTrace.ts';

interface SidebarState {
	collapsed: boolean;
	toggle: () => void;
}

/** Below this the labelled rail costs 240px of a viewport that has none to spare. */
const labelledRailMinWidth = 1024;

/**
 * First-load default only. At 768x1024 the expanded rail spends a quarter of the width on labels
 * the glyphs already carry, so a tablet opens on the icon rail; anyone who has toggled the rail
 * before gets their own choice back instead, because `persist` rehydrates over this.
 */
export function defaultCollapsedForWidth(width: number): boolean {
	return width < labelledRailMinWidth;
}

export const useSidebarStore = create<SidebarState>()(
	persist(
		(set, get) => ({
			collapsed:
				typeof window === 'undefined' ? false : defaultCollapsedForWidth(window.innerWidth),
			toggle: () => {
				const before = get().collapsed;
				const after = !before;
				set({ collapsed: after });
				traceDataMovement({
					category: 'state',
					layer: 'state',
					operation: 'toggle',
					source: 'sidebarStore',
					summary: {
						after: summarizeValue(after),
						before: summarizeValue(before),
						changedKeys: ['collapsed'],
					},
				});
			},
		}),
		{ name: 'aidd-sidebar' },
	),
);
