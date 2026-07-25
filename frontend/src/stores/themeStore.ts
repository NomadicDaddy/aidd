import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { summarizeValue, traceDataMovement } from '../lib/dataMovementTrace.ts';

export type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeState {
	mode: ThemeMode;
	setMode: (mode: ThemeState['mode']) => void;
}

export const useThemeStore = create<ThemeState>()(
	persist(
		(set, get) => ({
			mode: 'dark',
			setMode: (mode) => {
				const before = get().mode;
				set({ mode });
				traceDataMovement({
					category: 'state',
					layer: 'state',
					operation: 'setMode',
					source: 'themeStore',
					summary: {
						after: summarizeValue(mode),
						before: summarizeValue(before),
						changedKeys: ['mode'],
					},
				});
			},
		}),
		{ name: 'aidd-theme' },
	),
);
