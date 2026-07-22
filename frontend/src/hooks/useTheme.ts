import { useEffect } from 'react';

import { type ThemeMode, useThemeStore } from '../stores/themeStore.ts';

const mediaQuery = '(prefers-color-scheme: dark)';

export function useTheme() {
	const mode = useThemeStore((state) => state.mode);
	const setMode = useThemeStore((state) => state.setMode);

	useEffect(() => {
		const media = window.matchMedia(mediaQuery);

		function apply(themeMode: ThemeMode) {
			const isDark = themeMode === 'dark' || (themeMode === 'system' && media.matches);
			document.documentElement.classList.toggle('dark', isDark);
			document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
		}

		apply(mode);

		if (mode !== 'system') return;

		const onChange = () => apply('system');
		media.addEventListener('change', onChange);
		return () => media.removeEventListener('change', onChange);
	}, [mode]);

	return { mode, setMode } as const;
}
