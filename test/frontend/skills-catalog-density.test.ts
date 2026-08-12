import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');
const SKILLS_DIR = join(FRONTEND_ROOT, 'src', 'pages', 'skills');

/**
 * Renders the catalog through react-dom/server. The claims this feature makes about a row — which
 * name leads it, that selection is announced and not merely painted, that `bundled` no longer costs
 * a pill on every row — are claims about emitted markup, so they are asserted against it.
 */
interface Rendered {
	filtered: string;
	focusRestored: string;
	selected: string;
	unselected: string;
}

function renderCatalog(): Rendered {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SkillCatalog } from './src/pages/skills/SkillCatalog.tsx';

function skill(overrides) {
	return {
		allowedTools: null,
		body: 'body',
		category: 'general',
		compatibility: null,
		description: 'Describes what the skill does.',
		id: 'demo-skill',
		imported: null,
		origin: 'bundled',
		supportPaths: [],
		title: 'Demo Skill',
		usage: null,
		...overrides,
	};
}

const rows = [
	skill({}),
	skill({ id: 'imported-skill', origin: 'imported', title: 'Imported Skill' }),
];

function render(props) {
	return renderToStaticMarkup(
		createElement(SkillCatalog, {
			activeId: null,
			loading: false,
			onSelect: () => {},
			total: 2,
			usageByResourceId: new Map(),
			...props,
		}),
	);
}

console.log(JSON.stringify({
	selected: render({ activeId: 'demo-skill', selectedId: 'demo-skill', skills: rows }),
	unselected: render({ activeId: 'imported-skill', selectedId: 'imported-skill', skills: rows }),
	filtered: render({ selectedId: null, skills: [rows[0]] }),
	focusRestored: render({ activeId: 'imported-skill', selectedId: null, skills: rows }),
}));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout).trim()) as Rendered;
}

const rendered = renderCatalog();

function skillsSource(file: string): Promise<string> {
	return readFile(join(SKILLS_DIR, file), 'utf8');
}

describe('the skills catalog scans by name', () => {
	test('a row leads with the title the detail card echoes, with the id beneath it', () => {
		const titleIndex = rendered.selected.indexOf('Demo Skill');
		const idIndex = rendered.selected.indexOf('demo-skill');

		expect(titleIndex).toBeGreaterThan(-1);
		expect(idIndex).toBeGreaterThan(titleIndex);
		expect(rendered.selected).toContain('text-sm font-semibold text-foreground');
	});

	test('selection is announced, not only painted', () => {
		// The teal fill was the only signal that a row was the one being detailed. `aria-pressed`
		// fixed that but said "toggle button", one of 76: the rail is a single-select list, and
		// `aria-selected` inside a `role="listbox"` is how that is said.
		expect(rendered.selected).toContain('role="listbox"');
		expect(rendered.selected).toContain('aria-selected="true"');
		expect(rendered.selected.match(/aria-selected="false"/g)?.length).toBe(1);
		expect(rendered.selected).not.toContain('aria-pressed');
	});

	test('the rail costs one Tab, not one per row', () => {
		// 76 rows meant 76 tab stops between the category filter and the launch button below.
		expect(rendered.selected.match(/tabindex="0"/g)?.length).toBe(1);
		expect(rendered.selected).toContain('tabindex="-1"');
		// With nothing selected the stop falls on the first row rather than disappearing.
		expect(rendered.filtered.match(/tabindex="0"/g)?.length).toBe(1);
	});

	test('a focus-restored row remains active without claiming selection', () => {
		expect(rendered.focusRestored).not.toContain('aria-selected="true"');
		expect(rendered.focusRestored.match(/aria-selected="false"/g)?.length).toBe(2);
		expect(rendered.focusRestored.match(/tabindex="0"/g)?.length).toBe(1);
		expect(rendered.focusRestored).toMatch(
			/aria-label="Imported Skill" aria-selected="false"[^>]*id="skill-option-imported-skill"[^>]*tabindex="0"/,
		);
	});

	test('selection paints from the accent tokens the rest of the app selects with', async () => {
		const source = await skillsSource('SkillCatalog.tsx');

		expect(source).toContain('border-accent bg-accent-muted');
		expect(source).not.toMatch(/teal-\d/);
		expect(rendered.selected).toContain('border-accent bg-accent-muted');
	});

	test('only the exceptional origin still earns a badge', () => {
		// `bundled` reads on every row in the catalog and distinguishes nothing.
		expect(rendered.selected).toContain('imported');
		expect(rendered.selected).not.toContain('>bundled<');
	});

	test('a row is one line of summary, not two, so the window holds more of the catalog', async () => {
		const source = await skillsSource('SkillCatalog.tsx');

		expect(source).toContain('line-clamp-1');
		expect(source).not.toContain('line-clamp-2');
		expect(source).toContain('px-3 py-1.5');
	});

	test('filtering reports how much of the catalog survived it', () => {
		expect(rendered.filtered).toContain('1 of 2 skills');
		expect(rendered.selected).toContain('2 skills');
	});
});

describe('the skills page puts the catalog first', () => {
	test('import is a header action opening a dialog, not the first card on the page', async () => {
		const [page, dialog] = await Promise.all([
			skillsSource('SkillsPage.tsx'),
			skillsSource('SkillImportDialog.tsx'),
		]);

		expect(page).toContain('<SkillImportDialog onClose=');
		expect(page).toContain('Import skill');
		expect(dialog).toContain('export function SkillImportDialog(');
		expect(dialog).toContain('<DialogPanel');
	});

	test('the category filter sits in a full-width card above the split', async () => {
		const page = await skillsSource('SkillsPage.tsx');
		const filterCard = page.indexOf('<SegmentedControl');
		const split = page.indexOf('@min-[40rem]:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]');

		expect(filterCard).toBeGreaterThan(-1);
		expect(split).toBeGreaterThan(filterCard);
	});

	test('the definition block is read as a document, not as source', async () => {
		// The card, not the page: `SkillsPage` crossed the 300-line ceiling and the definition block
		// is the piece of it that came out. The page is still held to the raw-source rendering it
		// used to do, because moving a card into its own file is not the same as having stopped.
		const card = await skillsSource('SkillDefinitionCard.tsx');
		const page = await skillsSource('SkillsPage.tsx');

		// It used to be the raw file in a `<pre>`, reflowed with `break-words whitespace-pre-wrap`
		// so the lines would at least stay on screen. Reflowing markdown source is the best a
		// `<pre>` can do; rendering it is what makes the headings real.
		expect(card).toContain('<MarkdownContent');
		expect(card).toContain('markdown={body}');
		expect(page).toContain('<SkillDefinitionCard body={selected.body} />');
		for (const source of [card, page]) expect(source).not.toContain('whitespace-pre-wrap');
	});
});

describe('the skill detail card labels its blocks', () => {
	test('every mono block carries a caption naming what it holds', async () => {
		const source = await skillsSource('SkillDetailsCard.tsx');

		for (const caption of ['Advisory declarations', 'Import source', 'Usage', 'Support files'])
			expect(source).toContain(`title="${caption}"`);
		expect(source).toContain('variant="sunken"');
	});

	test('card titles collapse to one step', async () => {
		const source = await skillsSource('SkillDetailsCard.tsx');

		// The title used to be a hand-rolled `text-base font-semibold` heading here. That class
		// pair now lives once, in CardHeader, so the property this test guards — one step, no
		// text-xl — is held by rendering through the shared header instead of by restating it.
		expect(source).toContain('<CardHeader');
		expect(source).toContain('title={skill.title}');
		expect(source).not.toContain('text-xl');
		expect(source).not.toMatch(/<h[1-6]/);
		// The pluralized `n files` badge this test used to guard is gone rather than fixed: the
		// SUPPORT FILES block on the same card lists those files by name, so the badge counted
		// what the reader could see three inches below. See skills-rail-polish.test.ts.
	});

	test('the skill id renders through the shared identifier slot', async () => {
		const source = await skillsSource('SkillDetailsCard.tsx');

		// Was a hand-rolled teal mono line, then a hand-rolled accent one. Both were this card
		// declaring its own treatment for an id; `identifier` is the slot that ended that.
		expect(source).toContain('identifier={skill.id}');
		expect(source).not.toContain('text-teal-700');
		expect(source).not.toContain('font-mono text-sm');
	});
});
