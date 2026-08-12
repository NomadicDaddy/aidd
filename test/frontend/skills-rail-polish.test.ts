import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');

function read(path: string): Promise<string> {
	return Bun.file(join(ROOT, path)).text();
}

function stripComments(source: string): string {
	return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

describe('the skills split is a sized region, not a page that scrolls', () => {
	test('the rail fills the region instead of guessing the chrome above it', async () => {
		const catalog = stripComments(await read('frontend/src/pages/skills/SkillCatalog.tsx'));

		// `max-h-[calc(100vh-9rem)]` was a guess at 144px of chrome that actually measures 188px,
		// so the card's bottom edge — and its last row — sat below the fold at rest, and the guess
		// went further wrong every time the filter strip wrapped to another line.
		expect(catalog).not.toContain('100vh-9rem');
		expect(catalog).not.toMatch(/max-h-\[calc\(100vh/);
		expect(catalog).toContain('@min-[40rem]:h-full');
		// The card is a column with one scrolling child, so the last row is bounded by the region
		// rather than by the viewport.
		expect(catalog).toContain('flex min-w-0 flex-col');
		expect(catalog).toContain('min-h-0 flex-1 overflow-auto');
	});

	test('the region height is measured rather than expressed as a constant', async () => {
		const page = stripComments(await read('frontend/src/pages/skills/SkillsPage.tsx'));
		const hook = await read('frontend/src/hooks/useViewportFill.ts');

		expect(page).toContain('useViewportFill<HTMLDivElement>()');
		expect(page).toContain('ref={splitRef}');
		// The `calc()` is only the pre-measurement fallback; the measured value wins. The gate is a
		// container query rather than `lg:` because the width that has to fit is the content
		// column's, and the sidebar rail sets that independently of the viewport — see
		// skills-mobile-split.test.ts.
		expect(page).toContain('@min-[40rem]:h-[var(--fill-height,calc(100vh-12rem))]');
		expect(hook).toContain("node.style.setProperty('--fill-height'");
		// Measured document-relative, so a mid-scroll measurement matches one taken at rest.
		expect(hook).toContain('node.getBoundingClientRect().top + window.scrollY');
		// The chrome above changes height without the window resizing (a wrapping filter strip),
		// which only an observer notices.
		expect(hook).toContain('new ResizeObserver(apply)');
	});

	test('the detail column is the scrollport the pattern claims', async () => {
		const page = stripComments(await read('frontend/src/pages/skills/SkillsPage.tsx'));

		// Only where the two panes are columns. Below that they are alternatives, each one taking the
		// whole region, and the document is the scrollport again — a 100vh-12rem box on a 390px
		// viewport would be a scrollport inside a scrollport.
		expect(page).toContain('@min-[40rem]:overflow-hidden');
		expect(page).toContain('@min-[40rem]:h-full @min-[40rem]:overflow-auto');
		// A scrollport inside the scrollport: the definition body had its own 28rem window, so a
		// long SKILL.md was read through a short box inside a tall one.
		expect(page).not.toContain('max-h-[28rem]');
	});
});

describe('the rail is one list with a current item, not 76 buttons', () => {
	test('the primitive carries listbox semantics and a single tab stop', async () => {
		const listbox = stripComments(await read('frontend/src/components/ui/listbox.tsx'));

		expect(listbox).toContain('role="listbox"');
		expect(listbox).toContain('role="option"');
		expect(listbox).toContain('aria-selected={selected}');
		// Exactly one row is tabbable, so the rail costs one Tab to enter and one to leave.
		expect(listbox).toContain('tabIndex={index === tabStopIndex ? 0 : -1}');
		expect(listbox).toContain('const tabStopIndex = selectedIndex === -1 ? 0 : selectedIndex;');
		for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
			expect(listbox).toContain(`event.key === '${key}'`);
		}
		// Moving focus must not drag every scrollable ancestor with it.
		expect(listbox).toContain("scrollIntoView({ block: 'nearest', inline: 'nearest' })");
	});

	test('the skills rail uses it and no longer renders a button per row', async () => {
		const catalog = stripComments(await read('frontend/src/pages/skills/SkillCatalog.tsx'));

		expect(catalog).toContain('<ListBox');
		expect(catalog).toContain('ariaLabel="Skills"');
		expect(catalog).not.toContain('<button');
		expect(catalog).not.toContain('aria-pressed');
	});

	test('the tab strip stays the precedent the primitive was drawn from', async () => {
		const tabs = await read('frontend/src/components/ui/tabs.tsx');

		// If the house roving-tabindex pattern moves, the listbox should move with it rather than
		// quietly become a second convention. Tabs additionally constrain their reveal to the local
		// overflow strip because a page-level tab change must not move the document.
		expect(tabs).toContain('tabIndex={selected ? 0 : -1}');
		expect(tabs).toContain('node.focus({ preventScroll: true })');
		expect(tabs).toContain('revealElementWithinScroller(scroller, node)');
	});
});

describe('a rail row says each thing once', () => {
	test('the title takes the line and the id takes its own', async () => {
		const catalog = stripComments(await read('frontend/src/pages/skills/SkillCatalog.tsx'));

		// Sharing one line truncated both: 'Promote Remediation to Fe…' beside 'promote-remediat…'
		// identified neither skill.
		expect(catalog).toContain(
			'<span className="truncate text-sm font-semibold text-foreground">',
		);
		expect(catalog).toContain('<span className="font-mono break-all">{skill.id}</span>');
		expect(catalog).not.toMatch(/truncate[^"]*font-mono|font-mono[^"]*truncate/);
	});

	test('the meta line carries the word, not the word and its icon', async () => {
		const catalog = stripComments(await read('frontend/src/pages/skills/SkillCatalog.tsx'));

		// A `ListTree` glyph immediately followed by the word "Recipe", and a `Gauge` glyph followed
		// by the usage count, printed the same fact twice in a row 18rem wide.
		expect(catalog).not.toContain('Gauge');
		expect(catalog).not.toContain('ListTree');
		expect(catalog).toContain("tags.join(' · ')");
	});

	test('a badge marks the exception, in the rail and in the detail card alike', async () => {
		const catalog = stripComments(await read('frontend/src/pages/skills/SkillCatalog.tsx'));
		const details = stripComments(await read('frontend/src/pages/skills/SkillDetailsCard.tsx'));

		// `bundled` is true of nearly every skill, so printing it distinguished nothing.
		expect(catalog).toContain("skill.origin === 'imported'");
		expect(details).toContain(
			'skill.origin === \'imported\' ? <Badge tone="neutral">imported</Badge>',
		);
		expect(catalog).not.toContain('{skill.origin}');
		expect(details).not.toContain('{skill.origin}');
		// The file count is answered by name in the SUPPORT FILES block on the same card.
		expect(details).not.toMatch(/supportCount === 1 \? 'file' : 'files'/);
		expect(details).toContain('title="Support files"');
	});
});
