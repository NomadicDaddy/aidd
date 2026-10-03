import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const frontendRoot = resolve(import.meta.dir, '../../frontend');

describe('browser theme color contract', () => {
	test('declares initial light and dark metadata aligned with the background tokens', async () => {
		const [html, css] = await Promise.all([
			Bun.file(resolve(frontendRoot, 'index.html')).text(),
			Bun.file(resolve(frontendRoot, 'src/index.css')).text(),
		]);

		expect(html).toContain(
			'<meta content="#f4f6f9" media="(prefers-color-scheme: light)" name="theme-color" />',
		);
		expect(html).toContain(
			'<meta content="#0c0f14" media="(prefers-color-scheme: dark)" name="theme-color" />',
		);
		expect(css).toContain('background: #f4f6f9;');
		expect(css).toContain('background: #0c0f14;');
	});

	test('applies the saved theme before the first paint', async () => {
		const [html, init, store] = await Promise.all([
			Bun.file(resolve(frontendRoot, 'index.html')).text(),
			Bun.file(resolve(frontendRoot, 'public/theme-init.js')).text(),
			Bun.file(resolve(frontendRoot, 'src/stores/themeStore.ts')).text(),
		]);
		// A classic, blocking script in <head>, ahead of the module entry: the CSP is
		// script-src 'self', so it is a file, and it must run before the body paints.
		const initAt = html.indexOf('<script src="/theme-init.js"></script>');
		const entryAt = html.indexOf('<script src="/src/main.tsx" type="module"></script>');
		expect(initAt).toBeGreaterThan(-1);
		expect(initAt).toBeLessThan(html.indexOf('</head>'));
		expect(initAt).toBeLessThan(entryAt);
		// The key it reads is the key the store writes.
		const key = /THEME_STORAGE_KEY = '([^']+)'/.exec(store)?.[1];
		expect(key).toBeDefined();
		expect(init).toContain(`localStorage.getItem('${key}')`);
		expect(store).toContain('name: THEME_STORAGE_KEY');
		// A plain classic script: no module syntax, nothing evaluated from a string.
		expect(init).not.toMatch(/\b(?:import|export)\b/);
		expect(init).not.toMatch(/\beval\s*\(|new Function\b/);
	});

	test('updates theme-color metadata when the effective application theme changes', async () => {
		const source = await Bun.file(resolve(frontendRoot, 'src/hooks/useTheme.ts')).text();

		expect(source).toContain("dark: '#0c0f14'");
		expect(source).toContain("light: '#f4f6f9'");
		expect(source).toContain('querySelectorAll<HTMLMetaElement>(\'meta[name="theme-color"]\')');
		expect(source).toContain(
			'element.content = isDark ? themeColors.dark : themeColors.light;',
		);
	});
});
