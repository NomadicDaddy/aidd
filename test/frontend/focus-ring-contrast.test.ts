import { describe, expect, test } from 'bun:test';

import {
	composite,
	contrast,
	frontendSource as source,
	tailwindColor,
	themeTokens,
	token,
} from '../_helpers/contrast.ts';

/** The WCAG 1.4.11 non-text contrast floor. A focus indicator is a non-text UI component. */
const FLOOR = 3;

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
			// Tailwind's own palette, not a copied hex: v4 moved its reds, and a v3 value here
			// measured a ring the browser never draws.
			const red = await tailwindColor(match?.[1] ?? '');
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
