import type { ITheme } from '@xterm/xterm';

import { useSyncExternalStore } from 'react';

import { useThemeStore } from '../../stores/themeStore.ts';

// Palettes tuned to the app's cyan-on-slate identity (sidebar slate-950, cyan-400 accents).
const darkTheme: ITheme = {
	background: '#020617',
	brightBlack: '#475569',
	cursor: '#22d3ee',
	cursorAccent: '#020617',
	foreground: '#e5e5e5',
	selectionBackground: '#164e63',
};

const lightTheme: ITheme = {
	background: '#ffffff',
	brightWhite: '#e5e5e5',
	cursor: '#0e7490',
	cursorAccent: '#ffffff',
	foreground: '#171717',
	selectionBackground: '#cffafe',
};

const media =
	typeof window === 'undefined' ? null : window.matchMedia('(prefers-color-scheme: dark)');

function subscribeSystemTheme(onChange: () => void): () => void {
	media?.addEventListener('change', onChange);
	return () => media?.removeEventListener('change', onChange);
}

/** Resolves the xterm theme from the app theme, tracking OS changes while mode is 'system'. */
export function useXtermTheme(): ITheme {
	const mode = useThemeStore((state) => state.mode);
	const systemDark = useSyncExternalStore(
		subscribeSystemTheme,
		() => media?.matches ?? true,
		() => true
	);
	const isDark = mode === 'dark' || (mode === 'system' && systemDark);
	return isDark ? darkTheme : lightTheme;
}
