import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { summarizeValue, traceDataMovement } from '../lib/dataMovementTrace.ts';

interface SidebarState {
	collapsed: boolean;
	toggle: () => void;
}

export const useSidebarStore = create<SidebarState>()(
	persist(
		(set, get) => ({
			collapsed: false,
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
		{ name: 'aidd-sidebar' }
	)
);
