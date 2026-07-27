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
