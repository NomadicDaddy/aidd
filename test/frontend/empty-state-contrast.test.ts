import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');
const STYLES_PATH = resolve(FRONTEND_ROOT, 'src/index.css');

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

function renderEmptyState(): string {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmptyState } from './src/components/shared/EmptyState.tsx';

const action = createElement('a', { href: '/docs' }, 'Browse docs');
console.log(renderToStaticMarkup(createElement(EmptyState, { action }, 'Nothing here.')));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

describe('empty-state contrast', () => {
	test('renders a legible dashed edge against its own fill', async () => {
		const markup = renderEmptyState();
		const styles = await Bun.file(STYLES_PATH).text();

		expect(markup).toContain('border-dashed');
		expect(markup).toContain('border-control-border');
		expect(markup).toContain('bg-muted');
		expect(markup).toContain('flex flex-col items-start gap-4');
		expect(markup).toContain('flex flex-wrap gap-4');

		for (const selector of [':root', '\\.dark']) {
			const theme = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\}`, 'u').exec(styles)?.[1];
			if (!theme) throw new Error(`Missing ${selector} theme block`);
			expect(
				contrastRatio(hexToken(theme, 'control-border'), hexToken(theme, 'muted')),
			).toBeGreaterThanOrEqual(3);
		}
	});
});
