import { describe, expect, test } from 'bun:test';

import { contrast, frontendSource, themeTokens, token } from '../_helpers/contrast.ts';

/**
 * `--accent` is text as well as fill: links, active navigation and the primary button's label all
 * lean on it. The light theme shipped teal-600 (#0d9488), which measured 3.74:1 on a white card,
 * under the 4.5:1 text floor everywhere it was used as text, and its white button label failed by
 * the same margin. The focus ring has its own test (focus-ring-contrast); this one is the text.
 */
const TEXT_FLOOR = 4.5;

describe('accent contrast', () => {
	test.each([':root', '.dark'])(
		'%s accent text and button label clear 4.5:1',
		async (selector) => {
			const tokens = themeTokens(await frontendSource('index.css'), selector);
			const accent = token(tokens, '--accent');

			for (const surface of ['--card', '--background']) {
				expect(contrast(accent, token(tokens, surface))).toBeGreaterThanOrEqual(TEXT_FLOOR);
			}
			expect(contrast(token(tokens, '--accent-foreground'), accent)).toBeGreaterThanOrEqual(
				TEXT_FLOOR,
			);
		},
	);
});
