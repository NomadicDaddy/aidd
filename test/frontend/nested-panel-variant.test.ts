import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function source(relative: string): string {
	return readFileSync(join(FRONTEND_ROOT, 'src', relative), 'utf8');
}

/** Renders a Card at the named variant and returns its markup. */
function renderCardAt(variant: string): string {
	const script = `
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Card } from './src/components/ui/card.tsx';
console.log(renderToStaticMarkup(createElement(Card, { variant: '${variant}' }, 'x')));
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

describe('nested panels use the declared sunken variant', () => {
	test('the sunken variant owns a fill, a border and a radius', () => {
		const sunken = renderCardAt('sunken');

		// The properties the two surfaces were each defining for themselves. Asserted on the
		// rendered card rather than on the variants table, so a call site cannot claim to use
		// the variant while overriding what it means.
		expect(sunken).toContain('bg-muted/90');
		expect(sunken).toContain('border-border/80');
		expect(sunken).toContain('rounded-xl');
		expect(sunken).not.toBe(renderCardAt('default'));
	});

	test('the docs rails are sunken cards rather than locally drawn boxes', () => {
		const outline = source('pages/docs/DocsOutline.tsx');
		const sidebar = source('pages/docs/DocsSidebar.tsx');

		expect(outline).toContain(
			'<Card className="px-3 py-2 @min-[61rem]:hidden" variant="sunken">',
		);
		expect(outline).toContain(
			'<Card className="hidden grid-cols-1 gap-2 p-3 @min-[61rem]:grid" variant="sunken">',
		);
		expect(sidebar).toContain('<Card className="grid gap-5 p-3" variant="sunken">');
		// The nav keeps the landmark; the card is only the box around it, and the nav wraps the
		// narrow disclosure as well so the outline is one named region at every width.
		expect(outline).toContain('<nav aria-label="On this page">');
		for (const rail of [outline, sidebar]) {
			expect(rail).not.toContain('border-border/60');
		}
		const narrowDisclosure = outline.slice(
			outline.indexOf('<details'),
			outline.indexOf('>', outline.indexOf('<details')),
		);
		expect(narrowDisclosure).toBe('<details className="group"');
	});

	test('a scheduled occurrence is a sunken card rather than a borderless muted fill', () => {
		const occurrence = source('pages/scheduled/ScheduledOccurrence.tsx');
		const open = occurrence.indexOf('<Card');

		expect(open).toBeGreaterThan(-1);
		expect(occurrence).toContain('variant="sunken">');
		// The two properties it used to name for itself. Scoped to the element, because the
		// comment above it quotes the old class by name.
		const card = occurrence.slice(open, occurrence.indexOf('>', open));
		expect(card).not.toContain('bg-muted/40');
		expect(card).not.toContain('rounded-md');
	});
});
