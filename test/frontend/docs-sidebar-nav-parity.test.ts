import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const FRONTEND_SOURCE = resolve(import.meta.dir, '../../frontend/src');

async function readSource(path: string): Promise<string> {
	return readFile(resolve(FRONTEND_SOURCE, path), 'utf8');
}

describe('docs sidebar nav parity', () => {
	test('marks the current section the way the shell rail does', async () => {
		const [sidebar, rail] = await Promise.all([
			readSource('pages/docs/DocsSidebar.tsx'),
			readSource('components/layout/SidebarNav.tsx'),
		]);

		// Two vertical navigations 30px apart marking "you are here" two different ways read as
		// two applications, so the active/inactive treatment is shared verbatim.
		expect(sidebar).toContain("'bg-accent-muted text-accent-muted-foreground shadow-sm");
		expect(rail).toContain("'bg-accent-muted text-accent-muted-foreground shadow-sm");
		expect(sidebar).toContain("'text-muted-foreground hover:bg-muted hover:text-foreground'");
		expect(rail).toContain("'text-muted-foreground hover:bg-muted hover:text-foreground'");
		expect(sidebar).toContain('left-0 h-5 w-[3px] rounded-full bg-accent transition-opacity');
		expect(rail).toContain('w-[3px] rounded-full bg-accent transition-opacity');
	});

	test('captions groups with the shared utility instead of an arbitrary size', async () => {
		const [sidebar, typography] = await Promise.all([
			readSource('pages/docs/DocsSidebar.tsx'),
			readSource('lib/typography.ts'),
		]);

		expect(typography).toContain('sectionCaptionClass');
		expect(sidebar).toContain("cn('mb-1.5 px-3', sectionCaptionClass)");
		expect(sidebar).not.toMatch(/text-\[0\.\d+rem\]/);
	});

	test('names each rendered instance so the two copies are distinguishable', async () => {
		const [sidebar, page] = await Promise.all([
			readSource('pages/docs/DocsSidebar.tsx'),
			readSource('pages/docs/DocsPage.tsx'),
		]);

		// One landmark per group, named by the group — so the qualifier distinguishing the two
		// simultaneously-rendered copies has to compose with it rather than replace it.
		expect(sidebar).toContain('aria-label={instance ? `${group} (${instance})` : group}');
		expect(page).toContain('<DocsSidebar instance="compact" />');
	});
});

describe('docs page layout', () => {
	test('collapses navigation behind a labelled disclosure below the two-column breakpoint', async () => {
		const page = await readSource('pages/docs/DocsPage.tsx');

		// Below the split a 14rem sidebar leaves the article too narrow, so the 16 section labels
		// move behind one control instead of stacking above the prose. The condition is the
		// region's own width now, not a viewport tier — see markdown-content for why.
		expect(page).toContain('<details className="rounded-xl border border-border bg-card');
		expect(page).toContain('@min-[45rem]:hidden');
		expect(page).toContain('<summary');
		expect(page).toContain('<div className="hidden @min-[45rem]:block">');
	});

	test('keeps the article heading out of the body and inside the page header', async () => {
		const page = await readSource('pages/docs/DocsPage.tsx');

		expect(page).toContain(
			'<MarkdownContent baseLevel={2} markdown={body} skipLeadingTitle />',
		);
		expect(page).toContain('title={section ? section.title : ');
		expect(page).toContain('breadcrumb=');
	});
});

describe('glossary rendering', () => {
	test('renders all 25 shipped terms in five semantic definition groups', async () => {
		const markdown = await readFile(
			resolve(FRONTEND_SOURCE, '../content/docs/glossary.md'),
			'utf8',
		);
		const script = [
			"import { createElement } from 'react';",
			"import { renderToStaticMarkup } from 'react-dom/server';",
			"import { MarkdownContent } from './src/components/shared/MarkdownContent.tsx';",
			`const markdown = ${JSON.stringify(markdown)};`,
			'const el = createElement(MarkdownContent, { baseLevel: 2, markdown, skipLeadingTitle: true });',
			'console.log(JSON.stringify(renderToStaticMarkup(el)));',
		].join('\n');
		const result = Bun.spawnSync([process.execPath, '-e', script], {
			cwd: resolve(FRONTEND_SOURCE, '..'),
			stderr: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		});
		if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
		const html = JSON.parse(new TextDecoder().decode(result.stdout).trim()) as string;

		// The structure is explicit in the source rather than inferred from bold-first bullets, so
		// all five authored groups keep their shape when an ordinary list elsewhere changes.
		expect(html.match(/<dl\b/g)).toHaveLength(5);
		expect(html.match(/<dt\b/g)).toHaveLength(25);
		expect(html.match(/<dd\b/g)).toHaveLength(25);
		expect(html).not.toContain('<ul');
		// The page header carries the title, so the body must not restate it.
		expect(html).not.toContain('>Glossary<');
	});
});

describe('small pages', () => {
	test('renders the 404 with the house page header and one recovery action', async () => {
		const page = await readSource('pages/notFound/NotFoundPage.tsx');

		expect(page).toContain('<PageHeader');
		expect(page).toContain('title="Page not found"');
		expect(page).toContain('description="The link may be outdated or mistyped."');
		// One recovery action, now secondary: the body is an EmptyState — an absence — and a
		// filled accent button on it read as an emphasised piece of content instead.
		expect(page.match(/buttonClassName\('secondary'\)/g)).toHaveLength(1);
		expect(page).not.toContain("buttonClassName('primary')");
		expect(page).toContain('Back to Dashboard');
	});

	test('gives About a real heading and an honest metadata block', async () => {
		const page = await readSource('pages/about/AboutPage.tsx');

		// The heading is `PageHeader`'s h1 now, the same as every other route, rather than a
		// hand-rolled one inside a hero section — /about used to have no heading at all.
		expect(page).toContain('<PageHeader');
		// And it says "About", matching the rail item that is highlighted while you are here. This
		// was the one top-level route whose h1 did not echo its nav label; it repeated the wordmark
		// sitting 234px to its left instead. The product name moved to the description, which is
		// where a page says what it is rather than what it is called.
		expect(page).toContain('title="About"');
		expect(page).toContain('description="aidd — AI Development Director"');
		expect(page).toContain('__AIDD_VERSION__');
		expect(page).toContain('__AIDD_REPOSITORY_URL__');
		// Only values the build can actually supply — no invented commit hash or build date.
		expect(page).not.toMatch(/Commit|Built|Build date/);
	});

	test('declares both build constants the About page reads', async () => {
		const [types, config] = await Promise.all([
			readSource('types/build-constants.d.ts'),
			readFile(resolve(FRONTEND_SOURCE, '../vite.config.ts'), 'utf8'),
		]);

		expect(types).toContain('declare const __AIDD_REPOSITORY_URL__: string;');
		expect(types).toContain('declare const __AIDD_VERSION__: string;');
		expect(config).toContain('__AIDD_REPOSITORY_URL__: JSON.stringify(repositoryUrl)');
		// `git+https://….git` is the clone address; About links a human at the browsable URL.
		expect(config).toContain("replace(/^git\\+/, '').replace(/\\.git$/, '')");
	});

	test('labels every badge-lab catalog card and stops the short ones stretching', async () => {
		const page = await readSource('pages/settings/ExecutionIdentityCatalogSections.tsx');

		expect(page).toContain('<Card aria-labelledby={id}>');
		// Container steps, not `xl:`. The row reads its own width, so the 736px column at 1024x768
		// gets two columns instead of the single one the viewport breakpoint gave it.
		expect(page).toContain(
			'<div className="grid items-start gap-4 @min-[32rem]:grid-cols-2 @min-[61rem]:grid-cols-3">',
		);
		// "Ollama" over "ollama" restated the chip, so the prose label survived only where the
		// display name genuinely differs — which left three of eleven entries carrying a word
		// loose in the wrap flow and eight carrying nothing. Same rule, through the tooltip's
		// `hint` now, so the distinction is still available and every row is one shape.
		expect(page).toContain('function cliDisplayTitle');
		expect(page).toContain('label.toLowerCase() === cli.toLowerCase()');
		expect(page).toContain('hint={cliDisplayTitle(cli)}');
	});
});
