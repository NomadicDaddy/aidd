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
			loading: false,
			onSelect: () => {},
			total: 2,
			usageByResourceId: new Map(),
			...props,
		}),
	);
}

console.log(JSON.stringify({
	selected: render({ selectedId: 'demo-skill', skills: rows }),
	unselected: render({ selectedId: 'imported-skill', skills: rows }),
	filtered: render({ selectedId: null, skills: [rows[0]] }),
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
		// The teal fill was the only signal that a row was the one being detailed.
		expect(rendered.selected).toContain('aria-pressed="true"');
		expect(rendered.selected.match(/aria-pressed="false"/g)?.length).toBe(1);
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
		const split = page.indexOf('lg:grid-cols-[minmax(18rem,24rem)_1fr]');

		expect(filterCard).toBeGreaterThan(-1);
		expect(split).toBeGreaterThan(filterCard);
	});

	test('the definition block reflows its prose instead of slicing it at the edge', async () => {
		const page = await skillsSource('SkillsPage.tsx');

		expect(page).toContain('break-words whitespace-pre-wrap');
	});
});

describe('the skill detail card labels its blocks', () => {
	test('every mono block carries a caption naming what it holds', async () => {
		const source = await skillsSource('SkillDetailsCard.tsx');

		for (const caption of ['Advisory declarations', 'Import source', 'Usage', 'Support files'])
			expect(source).toContain(`title="${caption}"`);
		expect(source).toContain('variant="sunken"');
	});

	test('card titles collapse to one step and the file count pluralizes', async () => {
		const source = await skillsSource('SkillDetailsCard.tsx');

		expect(source).toContain('text-base font-semibold break-words text-foreground');
		expect(source).not.toContain('text-xl');
		expect(source).toContain("supportCount === 1 ? 'file' : 'files'");
	});

	test('the skill id takes the accent token rather than hand-rolled teal', async () => {
		const source = await skillsSource('SkillDetailsCard.tsx');

		expect(source).toContain('font-mono text-sm text-accent');
		expect(source).not.toContain('text-teal-700');
	});
});
