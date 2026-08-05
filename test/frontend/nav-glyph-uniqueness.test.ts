import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const FRONTEND_SOURCE = resolve(import.meta.dir, '../../frontend/src');

async function readSource(path: string): Promise<string> {
	return readFile(resolve(FRONTEND_SOURCE, path), 'utf8');
}

/** `{ icon: LayoutDashboard, label: 'Dashboard', to: '/' }` → `['LayoutDashboard', 'Dashboard']`. */
function readNavItems(source: string): { icon: string; label: string }[] {
	return [...source.matchAll(/\{ icon: (\w+), label: '([^']+)'/g)].map((match) => ({
		icon: match[1] ?? '',
		label: match[2] ?? '',
	}));
}

describe('navigation glyph uniqueness', () => {
	test('gives every destination its own icon', async () => {
		const source = await readSource('components/layout/nav-items.ts');
		const items = readNavItems(source);

		expect(items.length).toBeGreaterThanOrEqual(12);
		expect(new Set(items.map((item) => item.icon)).size).toBe(items.length);
	});

	test('separates Diary from Docs, which both used BookOpen', async () => {
		const source = await readSource('components/layout/nav-items.ts');
		const items = readNavItems(source);
		const iconFor = (label: string) => items.find((item) => item.label === label)?.icon;

		expect(iconFor('Diary')).toBe('NotebookPen');
		expect(iconFor('Docs')).toBe('BookOpen');
		expect(source).toContain("lucide-react/dist/esm/icons/notebook-pen'");
	});

	test('keeps the rail action glyphs clear of the nav destinations', async () => {
		const [navItems, launchButton] = await Promise.all([
			readSource('components/layout/nav-items.ts'),
			readSource('components/layout/DirectiveLaunchButton.tsx'),
		]);
		const navIcons = new Set(readNavItems(navItems).map((item) => item.icon));

		// `Play` is the Runs destination, so the directive launcher cannot also wear it.
		expect(navIcons.has('Play')).toBe(true);
		expect(launchButton).not.toContain('icons/play');
		expect(launchButton).toContain('icons/rocket');
	});

	test('states the directive launcher as a secondary action, not another ghost row', async () => {
		const launchButton = await readSource('components/layout/DirectiveLaunchButton.tsx');

		expect(launchButton).toContain('variant="secondary"');
		expect(launchButton).not.toContain('variant="ghost"');
	});

	test('demotes the shell preference controls to compact icon buttons', async () => {
		const layout = await readSource('components/layout/AppLayout.tsx');

		// Both preferences used to be full-width ghost `Button`s carrying a visible text label,
		// which gave them the same weight as the launch anchor and the report row above.
		expect(layout).toMatch(/<IconButton\s+ariaLabel="Set access token"/);
		expect(layout).toMatch(/<IconButton\s+ariaLabel=\{\s*themeMode === 'dark'/);
		// Each handler is wired exactly once, so the `IconButton` matches above are the only
		// controls that carry them.
		expect(layout.match(/onClick=\{openAuthPrompt\}/g)?.length).toBe(1);
		expect(layout.match(/onClick=\{toggleThemeMode\}/g)?.length).toBe(1);
	});
});
