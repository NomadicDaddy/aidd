import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

import { cn } from '../../frontend/src/lib/cn.ts';

// The lookbehind keeps responsive variants (`sm:p-7`) out of the audit: only the unprefixed
// utility has to beat Card's base `p-4`, and matching the prefixed one too would make the
// "last declared padding wins" comparison below compare against the wrong utility.
// All three spellings of a className: the literal string, the `cn('…', constant)` form a card uses
// when part of its class list is a shared export, and the template literal it uses when part of the
// list is computed inline. Reading only the literal would have quietly dropped a card from the audit
// the day its padding moved into a `cn()` call — or, as happened, the day a step card grew a
// conditional two-column split and its `p-3` moved inside backticks.
const CARD_PADDING_OVERRIDE =
	/<Card\b[^>]*className=(?:"([^"]*(?<![:\w-])p-(?:0|2\.5|3|5)\b[^"]*)"|\{cn\('([^']*(?<![:\w-])p-(?:0|2\.5|3|5)\b[^']*)'|\{`([^`]*(?<![:\w-])p-(?:0|2\.5|3|5)\b[^`]*)`)/g;
const PADDING_UTILITY = /(?<![:\w-])p-(?:0|2\.5|3|4|5)\b/g;
// An interpolation holds class names the audit cannot resolve from source, and none of them is a
// padding utility — the point of the audit is the one that is written here.
const INTERPOLATION = /\$\{[^}]*\}/g;

async function cardPaddingOverrides(): Promise<string[]> {
	const glob = new Bun.Glob('**/*.tsx');
	const overrides: string[] = [];
	for await (const file of glob.scan({ cwd: join(process.cwd(), 'frontend', 'src') })) {
		const source = await Bun.file(join(process.cwd(), 'frontend', 'src', file)).text();
		overrides.push(
			...[...source.matchAll(CARD_PADDING_OVERRIDE)].map((match) =>
				(match[1] ?? match[2] ?? match[3] ?? '').replaceAll(INTERPOLATION, ' ').trim(),
			),
		);
	}
	return overrides;
}

function renderCard(className: string): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { Card } from './src/components/ui/card.tsx';",
		`const card = createElement(Card, { className: ${JSON.stringify(className)} }, 'Content');`,
		'console.log(renderToStaticMarkup(card));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

function renderedClasses(className: string): string[] {
	const renderedClassName = renderCard(className).match(/class="([^"]+)"/)?.[1];
	if (!renderedClassName)
		throw new Error(`Card did not render a class attribute for ${className}`);
	return renderedClassName.split(' ');
}

describe('Tailwind class merging', () => {
	test('keeps the later conflicting utility', () => {
		expect(cn('rounded-xl border p-4', 'p-0')).toBe('rounded-xl border p-0');
		expect(cn('rounded-xl border p-4', 'p-3')).toBe('rounded-xl border p-3');
		expect(cn('p-4', false, null, undefined, 'p-2.5')).toBe('p-2.5');
	});

	test('renders Card with the requested padding instead of its base padding', () => {
		const unpaddedClasses = renderedClasses('p-0');
		const compactClasses = renderedClasses('p-3');

		expect(unpaddedClasses).toContain('p-0');
		expect(unpaddedClasses).not.toContain('p-4');
		expect(compactClasses).toContain('p-3');
		expect(compactClasses).not.toContain('p-4');
	});

	test('preserves every audited Card padding override as the winning utility', async () => {
		const overrides = await cardPaddingOverrides();

		// 36 + the Badge Lab's status-dot specimen card, which takes the same `p-0` the two
		// specimen cards above it take so its own header can carry the card's padding, + the two
		// the Reports/Audits pair added: the reports table's `p-0` scrollport and the compact
		// `p-3` audit row that replaced a hand-rolled bordered div, + the compact audit row's
		// unpadded Card whose internal identity/details regions own their padding independently,
		// + the mobile backend disclosure whose summary and control regions own their padding.
		expect(overrides).toHaveLength(41);
		for (const className of overrides) {
			const declaredPadding = className.match(PADDING_UTILITY)?.at(-1);
			const mergedPadding = cn('p-4', className).match(PADDING_UTILITY);

			if (!declaredPadding)
				throw new Error(`Card override has no padding utility: ${className}`);
			expect(mergedPadding).toEqual([declaredPadding]);
		}
	});
});
