import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

const FRONTEND_SOURCE = resolve(import.meta.dir, '../../frontend/src');

function hexToken(theme: string, token: string): string {
	const match = new RegExp(`--${token}:\\s*(#[0-9a-f]{6});`, 'iu').exec(theme);
	if (!match?.[1]) throw new Error(`Missing --${token} theme token`);
	return match[1];
}

function relativeLuminance(hex: string): number {
	const channels = [1, 3, 5].map(
		(index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255,
	);
	const linear = channels.map((channel) =>
		channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
	);
	return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrastRatio(first: string, second: string): number {
	const values = [relativeLuminance(first), relativeLuminance(second)];
	return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}

describe('DropdownMenu surface', () => {
	test('uses an opaque semantic surface pair with readable text in both themes', async () => {
		const [component, styles] = await Promise.all([
			Bun.file(join(FRONTEND_SOURCE, 'components/ui/dropdown-menu.tsx')).text(),
			Bun.file(join(FRONTEND_SOURCE, 'index.css')).text(),
		]);

		expect(component).toContain('border-border bg-card');
		expect(component).toContain('text-card-foreground');
		expect(component).not.toMatch(/(?:bg|text)-popover/u);
		expect(styles).toContain('--color-card: var(--card);');
		expect(styles).toContain('--color-card-foreground: var(--card-foreground);');

		for (const selector of [':root', '\\.dark']) {
			const theme = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\}`, 'u').exec(styles)?.[1];
			if (!theme) throw new Error(`Missing ${selector} theme block`);
			expect(
				contrastRatio(hexToken(theme, 'card'), hexToken(theme, 'card-foreground')),
			).toBeGreaterThanOrEqual(4.5);
		}
	});

	test('remains shared by the recipe and scheduled task action menus', async () => {
		const consumers: string[] = [];
		for await (const path of new Bun.Glob('**/*.tsx').scan({
			cwd: FRONTEND_SOURCE,
			onlyFiles: true,
		})) {
			const source = await Bun.file(join(FRONTEND_SOURCE, path)).text();
			if (source.includes("components/ui/dropdown-menu.tsx'")) {
				consumers.push(path.replaceAll('\\', '/'));
			}
		}

		expect(consumers.sort()).toEqual([
			'pages/recipes/detail/RecipeOverviewMode.tsx',
			'pages/scheduled/ScheduledTaskCard.tsx',
		]);
	});
});
