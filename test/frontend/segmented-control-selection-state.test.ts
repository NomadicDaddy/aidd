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

function renderSegmentedControl(): string {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SegmentedControl } from './src/components/ui/segmented-control.tsx';

console.log(renderToStaticMarkup(createElement(SegmentedControl, {
	ariaLabel: 'State',
	onChange: () => {},
	options: [
		{ label: 'Active', value: 'active' },
		{ label: 'Paused', value: 'paused' },
		{ disabled: true, label: 'Unavailable', value: 'unavailable' },
	],
	value: 'active',
})));
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

function renderCountedSegmentedControl(): string {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SegmentedControl } from './src/components/ui/segmented-control.tsx';

console.log(renderToStaticMarkup(createElement(SegmentedControl, {
	ariaLabel: 'State',
	onChange: () => {},
	options: [{ count: 12, label: 'Active', value: 'active' }],
	value: 'active',
})));
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

function renderAriaHiddenCountedSegmentedControl(): string {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SegmentedControl } from './src/components/ui/segmented-control.tsx';

console.log(renderToStaticMarkup(createElement(SegmentedControl, {
	ariaLabel: 'State',
	onChange: () => {},
	options: [{
		ariaLabel: 'Active',
		count: 12,
		countAriaHidden: true,
		label: 'Active',
		value: 'active',
	}],
	value: 'active',
})));
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

function buttonClass(markup: string, label: string): string {
	const match = markup.match(new RegExp(`<button class="([^"]+)"[^>]*>${label}</button>`, 'u'));
	if (!match?.[1]) throw new Error(`Missing rendered ${label} segment`);
	return match[1];
}

describe('segmented-control selection state', () => {
	test('keeps selection stronger than focus without sacrificing label contrast', async () => {
		const styles = await Bun.file(STYLES_PATH).text();
		for (const selector of [':root', '\\.dark']) {
			const theme = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\}`, 'u').exec(styles)?.[1];
			if (!theme) throw new Error(`Missing ${selector} theme block`);
			const raised = hexToken(theme, 'raised');
			const focus = hexToken(theme, 'raised-foreground');
			const track = hexToken(theme, 'muted');

			expect(contrastRatio(raised, track)).toBeGreaterThanOrEqual(3);
			expect(contrastRatio(focus, raised)).toBeGreaterThanOrEqual(3);
			expect(contrastRatio(focus, track)).toBeGreaterThanOrEqual(3);
			expect(contrastRatio(hexToken(theme, 'control-border'), track)).toBeGreaterThanOrEqual(
				3,
			);
			expect(
				contrastRatio(hexToken(theme, 'raised-foreground'), raised),
			).toBeGreaterThanOrEqual(4.5);
		}
	});

	test('keeps the active fill independent of both track and host surfaces', async () => {
		const styles = await Bun.file(STYLES_PATH).text();
		expect(styles).toContain('--color-raised: var(--raised);');
		expect(styles).toContain('--color-raised-foreground: var(--raised-foreground);');
		for (const selector of [':root', '\\.dark']) {
			const theme = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\}`, 'u').exec(styles)?.[1];
			if (!theme) throw new Error(`Missing ${selector} theme block`);
			const raised = hexToken(theme, 'raised');

			expect(contrastRatio(raised, hexToken(theme, 'card'))).toBeGreaterThan(1.05);
			expect(contrastRatio(raised, hexToken(theme, 'muted'))).toBeGreaterThan(1.05);
		}
	});

	test('moves inactive hover from the track toward selection without matching its host', async () => {
		const styles = await Bun.file(STYLES_PATH).text();
		expect(styles).toContain('--color-raised-hover: var(--raised-hover);');
		for (const selector of [':root', '\\.dark']) {
			const theme = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\}`, 'u').exec(styles)?.[1];
			if (!theme) throw new Error(`Missing ${selector} theme block`);
			const hover = hexToken(theme, 'raised-hover');
			const hoverLuminance = relativeLuminance(hover);
			const raisedLuminance = relativeLuminance(hexToken(theme, 'raised'));
			const track = hexToken(theme, 'muted');
			const trackLuminance = relativeLuminance(track);

			expect(contrastRatio(hover, track)).toBeGreaterThanOrEqual(1.4);
			expect(contrastRatio(hover, hexToken(theme, 'card'))).toBeGreaterThan(1.05);
			expect(
				(hoverLuminance - trackLuminance) * (raisedLuminance - trackLuminance),
			).toBeGreaterThan(0);
			expect(Math.abs(hoverLuminance - trackLuminance)).toBeLessThan(
				Math.abs(raisedLuminance - trackLuminance),
			);
		}
	});

	test('renders one neutral focus indicator without changing global button focus', async () => {
		const markup = renderSegmentedControl();
		const active = buttonClass(markup, 'Active');
		const inactive = buttonClass(markup, 'Paused');
		const styles = await Bun.file(STYLES_PATH).text();

		for (const segment of [active, inactive]) {
			expect(segment).toContain('focus-visible:ring-2');
			expect(segment).toContain('focus-visible:ring-raised-foreground');
			expect(segment).toContain('focus-visible:ring-inset');
			expect(segment).toContain('focus-visible:ring-offset-0');
			expect(segment).toContain('focus-visible:outline-none');
			expect(segment).not.toContain('focus-visible:ring-1');
			expect(segment).not.toContain('focus-visible:ring-control-border');
			expect(segment).not.toContain('focus-visible:ring-ring/80');
		}

		expect(styles).toMatch(
			/:focus-visible \{[\s\S]*outline: 2px solid var\(--ring\);[\s\S]*outline-offset: 2px;/u,
		);
	});

	test('previews selection on inactive hover without changing the active tile', () => {
		const markup = renderSegmentedControl();
		const active = buttonClass(markup, 'Active');
		const disabled = buttonClass(markup, 'Unavailable');
		const inactive = buttonClass(markup, 'Paused');

		expect(active).toContain('rounded-sm');
		expect(active).toContain('border-control-border');
		expect(active).toContain('bg-raised');
		expect(active).toContain('text-raised-foreground');
		expect(active).toContain('hover:bg-raised');
		expect(active).toContain('dark:hover:bg-raised');
		expect(active).not.toContain('bg-card');
		expect(active).not.toContain('bg-raised-hover');
		expect(active).not.toContain('rounded-lg');
		expect(active).not.toContain('shadow-sm');
		expect(active).not.toContain('dark:hover:bg-accent-muted');

		expect(inactive).toContain('rounded-sm');
		expect(inactive).toContain('border-transparent');
		expect(inactive).toContain('hover:border-border');
		expect(inactive).toContain('hover:bg-raised-hover');
		expect(inactive).toContain('dark:hover:border-border');
		expect(inactive).toContain('dark:hover:bg-raised-hover');
		expect(inactive).not.toContain('hover:bg-card');
		expect(inactive).not.toContain('hover:bg-muted');
		expect(inactive).not.toContain('border-control-border');

		expect(disabled).toContain('hover:border-transparent');
		expect(disabled).toContain('hover:bg-transparent');
		expect(disabled).not.toContain('hover:border-border');
		expect(disabled).not.toContain('hover:bg-raised-hover');
		expect(disabled).not.toContain('dark:hover:border-border');
		expect(disabled).not.toContain('dark:hover:bg-raised-hover');
	});

	test('owns the visual treatment for optional segment counts', () => {
		const markup = renderCountedSegmentedControl();
		expect(markup).toContain(
			'<span class="inline-flex items-center gap-1.5">Active<span class="tabular-nums text-raised-foreground">12</span></span>',
		);
	});

	test('can keep a visual count out of the accessible segment name', () => {
		const markup = renderAriaHiddenCountedSegmentedControl();
		expect(markup).toContain('aria-label="Active"');
		expect(markup).toContain(
			'<span aria-hidden="true" class="tabular-nums text-raised-foreground">12</span>',
		);
	});
});
