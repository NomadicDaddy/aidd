import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const FRONTEND_SRC = resolve(import.meta.dir, '../../frontend/src');
const source = (path: string) => readFile(resolve(FRONTEND_SRC, path), 'utf8');

/** The WCAG 1.4.11 non-text contrast floor. A focus indicator is a non-text UI component. */
const FLOOR = 3;

/** Tailwind's red scale, for the two weights the invalid-control ring picks from. */
const TAILWIND_RED: Record<string, string> = { 'red-400': '#f87171', 'red-600': '#dc2626' };

type Rgb = readonly [number, number, number];

function parseHex(hex: string): Rgb {
	const channel = (index: number) => Number.parseInt(hex.slice(index, index + 2), 16);
	return [channel(1), channel(3), channel(5)];
}

function channelLuminance(value: number): number {
	const channel = value / 255;
	return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance([red, green, blue]: Rgb): number {
	return (
		0.2126 * channelLuminance(red) +
		0.7152 * channelLuminance(green) +
		0.0722 * channelLuminance(blue)
	);
}

function contrast(a: Rgb, b: Rgb): number {
	const [first, second] = [luminance(a), luminance(b)];
	return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/**
 * Alpha compositing happens in gamma space in every browser, so the blend is a plain per-channel
 * mix of the two sRGB values. Doing it in linear space here would flatter the result by roughly a
 * tenth of a point and quietly hide a ring that is actually under the floor.
 */
function composite([fr, fg, fb]: Rgb, [br, bg, bb]: Rgb, alpha: number): Rgb {
	const mix = (front: number, back: number) => Math.round(front * alpha + back * (1 - alpha));
	return [mix(fr, br), mix(fg, bg), mix(fb, bb)];
}

/** The custom-property block for one theme, so `--ring` is read per theme and not once globally. */
function themeTokens(css: string, selector: string): Map<string, string> {
	const start = css.indexOf(`${selector} {`);
	if (start < 0) throw new Error(`no ${selector} block in index.css`);
	const block = css.slice(start, css.indexOf('\n}', start));
	const tokens = new Map<string, string>();
	for (const match of block.matchAll(/^\t(--[a-z-]+):\s*(#[0-9a-f]{6});$/gmu)) {
		const [, name, value] = match;
		if (name && value) tokens.set(name, value);
	}
	return tokens;
}

/** Reads one token as a colour, so a renamed or removed token fails loudly instead of as `NaN`. */
function token(tokens: Map<string, string>, name: string): Rgb {
	const value = tokens.get(name);
	if (!value) throw new Error(`no ${name} in this theme block`);
	return parseHex(value);
}

/** The alpha the shared class actually ships, so the assertion cannot drift from the class list. */
function ringAlpha(classList: string, utility: string): number {
	const match = new RegExp(`${utility}/([0-9]+)`, 'u').exec(classList);
	const alpha = match?.[1];
	if (!alpha) throw new Error(`no ${utility}/<alpha> in the class list`);
	return Number(alpha) / 100;
}

const SURFACES = ['--card', '--background', '--muted'] as const;

describe('focus ring contrast', () => {
	test('the accent ring clears the non-text floor on every surface, in both themes', async () => {
		const [css, formStyles] = await Promise.all([
			source('index.css'),
			source('lib/formStyles.ts'),
		]);
		const alpha = ringAlpha(formStyles, 'focus-visible:ring-ring');

		for (const selector of [':root', '.dark']) {
			const tokens = themeTokens(css, selector);
			const ring = token(tokens, '--ring');
			for (const name of SURFACES) {
				const surface = token(tokens, name);
				// Full strength is what the global `:focus-visible` outline in index.css draws, and
				// what `ring-ring` draws at the sites that take no alpha.
				expect(contrast(ring, surface)).toBeGreaterThanOrEqual(FLOOR);
				// And at the alpha the shared class ships, which is the ring most controls draw.
				expect(contrast(composite(ring, surface, alpha), surface)).toBeGreaterThanOrEqual(
					FLOOR,
				);
			}
		}
	});

	test('the dark ring keeps the headroom it had', async () => {
		const dark = themeTokens(await source('index.css'), '.dark');
		const ring = token(dark, '--ring');
		const card = token(dark, '--card');

		// The light theme was the defect; raising its token must not be paid for out of the dark
		// one, which was already well clear at full strength and at half.
		expect(contrast(ring, card)).toBeGreaterThanOrEqual(9);
		expect(contrast(composite(ring, card, 0.5), card)).toBeGreaterThanOrEqual(FLOOR);
	});

	test('the invalid-control ring clears the floor in the theme that draws it', async () => {
		const [css, tones] = await Promise.all([source('index.css'), source('lib/tones.ts')]);

		// An invalid control is red before it is focused, so the ring is the whole of what focus
		// adds. One red at one alpha cannot clear the floor on a white card and a #161a22 one, which
		// is why this class splits by variant — and why the split is asserted rather than trusted.
		const light = /(?<!dark:)aria-invalid:focus-visible:ring-(red-\d+)\/(\d+)/u.exec(tones);
		const dark = /dark:aria-invalid:focus-visible:ring-(red-\d+)\/(\d+)/u.exec(tones);
		expect(light).not.toBeNull();
		expect(dark).not.toBeNull();

		for (const [selector, match] of [
			[':root', light],
			['.dark', dark],
		] as const) {
			const weight = match?.[1] ?? '';
			expect(Object.keys(TAILWIND_RED)).toContain(weight);
			const red = parseHex(TAILWIND_RED[weight] ?? '');
			const alpha = Number(match?.[2]) / 100;
			const tokens = themeTokens(css, selector);
			for (const name of SURFACES) {
				const surface = token(tokens, name);
				expect(contrast(composite(red, surface, alpha), surface)).toBeGreaterThanOrEqual(
					FLOOR,
				);
			}
		}
	});

	test('no focus ring is left at an alpha the light theme cannot carry', async () => {
		const light = themeTokens(await source('index.css'), ':root');
		const ring = token(light, '--ring');
		const card = token(light, '--card');

		// The two remaining fractional `ring-ring` alphas are not focus indicators — a dialog
		// hairline and a selected graph node that also changes border, background and shadow. This
		// records that fact with the arithmetic that would otherwise condemn them: at /50 the light
		// ring is below the floor, so any *focus* use of a low alpha is a defect.
		expect(contrast(composite(ring, card, 0.5), card)).toBeLessThan(FLOOR);
		const sources = await Promise.all(
			['components/ui/dialog.tsx', 'pages/projects/detail/dependencyGraphComponents.tsx'].map(
				source,
			),
		);
		for (const file of sources) {
			expect(file).not.toMatch(/focus-(visible|within):ring-ring\/[1-7]\d?\b/u);
		}
	});
});
