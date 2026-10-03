import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { summarizeValue, traceDataMovement } from '../lib/dataMovementTrace.ts';
import { resilientLocalStorage } from './persistStorage.ts';

export type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeState {
	mode: ThemeMode;
	setMode: (mode: ThemeState['mode']) => void;
}

/**
 * The localStorage key the theme persists under. public/theme-init.js reads the same key before the
 * first paint and cannot import this module; test/frontend/theme-color-contract.test.ts holds the
 * two to the same value.
 */
export const THEME_STORAGE_KEY = 'aidd-theme';

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
		{
			name: THEME_STORAGE_KEY,
			storage: createJSONStorage(() => resilientLocalStorage),
		},
	),
);
