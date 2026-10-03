/*
 * Applies the saved theme before the first paint.
 *
 * useTheme sets the `dark` class in a passive effect, which runs after React's first commit has
 * painted, so every load showed the light theme first and then switched - on a panel whose default
 * is dark. This runs from <head>, before <body> exists, and does the same thing the effect does.
 *
 * A file rather than an inline script because the panel's Content-Security-Policy is
 * `script-src 'self'`. It reads the same `aidd-theme` key the theme store persists, and falls back
 * to the store's own default, dark, when nothing is saved or storage cannot be read.
 */
(function () {
	var mode = 'dark';
	try {
		var saved = JSON.parse(localStorage.getItem('aidd-theme') || 'null');
		if (saved && saved.state && typeof saved.state.mode === 'string') mode = saved.state.mode;
	} catch (error) {
		// Unreadable storage keeps the default.
	}
	var dark =
		mode === 'dark' ||
		(mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
	document.documentElement.classList.toggle('dark', dark);
	document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
})();
