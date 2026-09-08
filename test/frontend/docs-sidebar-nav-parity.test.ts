import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
	NAV_DESTINATION_GROUPS,
	NAV_DESTINATIONS,
} from '../../frontend/src/components/layout/nav-destinations.ts';
import {
	DOC_GROUP_ORDER,
	DOC_SECTIONS,
	DOCS_SIDEBAR_GROUPS,
} from '../../frontend/src/pages/docs/docs-manifest.ts';

const FRONTEND_SOURCE = resolve(import.meta.dir, '../../frontend/src');

async function readSource(path: string): Promise<string> {
	return readFile(resolve(FRONTEND_SOURCE, path), 'utf8');
}

function renderDocsSidebar(pathname: string): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		"import { DocsSidebar } from './src/pages/docs/DocsSidebar.tsx';",
		`const view = createElement(MemoryRouter, { initialEntries: [${JSON.stringify(pathname)}] }, createElement(DocsSidebar));`,
		'console.log(JSON.stringify(renderToStaticMarkup(view)));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(FRONTEND_SOURCE, '..'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout).trim()) as string;
}

describe('docs sidebar navigation contract', () => {
	test('keeps the shell selection primary and documentation chrome subordinate', async () => {
		const [outline, pager, sidebar, rail, styles] = await Promise.all([
			readSource('pages/docs/DocsOutline.tsx'),
			readSource('pages/docs/DocsPager.tsx'),
			readSource('pages/docs/DocsSidebar.tsx'),
			readSource('components/layout/SidebarNav.tsx'),
			readSource('pages/docs/docsNavigationStyles.ts'),
		]);

		expect(rail).toContain("'bg-accent-muted text-accent-muted-foreground shadow-sm");
		expect(styles).toContain("'font-medium text-foreground'");
		for (const secondary of [outline, sidebar]) {
			expect(secondary).toContain('docsCurrentLocationClass');
			expect(secondary).not.toContain('bg-accent-muted');
			expect(secondary).not.toContain('shadow-sm');
		}
		expect(sidebar).toContain("'text-muted-foreground hover:bg-muted hover:text-foreground'");
		expect(rail).toContain("'text-muted-foreground hover:bg-muted hover:text-foreground'");
		expect(sidebar).toContain(
			'top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent transition-opacity',
		);
		expect(outline).toContain(
			'left-0 size-1.5 -translate-y-1/2 rounded-full bg-accent transition-opacity',
		);
		expect(outline).not.toContain('h-5 w-[3px]');
		expect(rail).toContain('w-[3px] rounded-full bg-accent transition-opacity');
		expect(styles).toContain('docsNavigationFocusClass = linkFocusClass');
		expect(styles).not.toContain('focus-visible:ring');
		expect(styles).not.toContain('focus-visible:outline-none');
		for (const navigation of [outline, pager, sidebar]) {
			expect(navigation).toContain('docsNavigationFocusClass');
			expect(navigation).not.toContain('focus-visible:ring-offset-2');
		}
	});

	test('renders one semantic current document without a second primary fill', () => {
		const html = renderDocsSidebar('/docs/pipelines');
		const currentLinks = html.match(/aria-current="page"/gu) ?? [];
		const currentGuide = html.match(
			/<a(?=[^>]*aria-current="page")(?=[^>]*href="\/docs\/pipelines")[^>]*>/u,
		)?.[0];
		const currentGuideClasses = currentGuide?.match(/class="([^"]+)"/u)?.[1];

		expect(currentLinks).toHaveLength(1);
		expect(currentGuide).toBeDefined();
		expect(currentGuideClasses).toContain('text-foreground');
		expect(currentGuideClasses).not.toContain('bg-accent-muted');
		expect(currentGuideClasses).not.toContain('shadow-sm');
	});

	test('derives shared page order and grouping from the primary navigation registry', () => {
		const sharedDocs = DOC_SECTIONS.filter(
			(section): section is { route: string } & typeof section => section.route !== undefined,
		);
		const docsRoutes = new Set(sharedDocs.map((section) => section.route));
		const expectedOrder = NAV_DESTINATIONS.map((destination) => destination.to).filter(
			(route) => docsRoutes.has(route),
		);

		expect(sharedDocs.map((section) => section.route)).toEqual(expectedOrder);
		for (const group of NAV_DESTINATION_GROUPS) {
			for (const destination of group.items) {
				if (!docsRoutes.has(destination.to)) continue;
				expect(sharedDocs.find((section) => section.route === destination.to)?.group).toBe(
					group.label,
				);
			}
		}
		expect(DOC_GROUP_ORDER).toEqual([
			'Getting started',
			...NAV_DESTINATION_GROUPS.map((group) => group.label),
			'Reference',
		]);
	});

	test('renders only documentation-owned groups and destinations', () => {
		const html = renderDocsSidebar('/docs/runs');
		const groupLabels = [...html.matchAll(/<nav aria-label="([^"]+)"/gu)].map(
			(match) => match[1],
		);
		const sidebarSlugs = DOCS_SIDEBAR_GROUPS.flatMap((group) => [...group.slugs]);
		const renderedSlugs = [...html.matchAll(/href="\/docs\/([^"]+)"/gu)].map(
			(match) => match[1],
		);

		expect(groupLabels).toEqual(DOCS_SIDEBAR_GROUPS.map((group) => group.label));
		expect(renderedSlugs).toEqual(sidebarSlugs);
		expect(renderedSlugs).toEqual(['getting-started', 'pipelines', 'faq', 'glossary']);
		expect(html).not.toMatch(/>Dashboard<|>Projects<|>Runs<|>Recipes<|>Skills<|>Audits</u);
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
		const [sidebar, navigationRail, page] = await Promise.all([
			readSource('pages/docs/DocsSidebar.tsx'),
			readSource('pages/docs/DocsNavigationRail.tsx'),
			readSource('pages/docs/DocsPage.tsx'),
		]);

		// One landmark per group, named by the group — so the qualifier distinguishing the two
		// simultaneously-rendered copies has to compose with it rather than replace it.
		expect(sidebar).toContain(
			'aria-label={instance ? `${group.label} (${instance})` : group.label}',
		);
		expect(navigationRail).toContain('<DocsSidebar instance="compact" />');
		expect(navigationRail).toContain('<DocsSidebar framed />');
		expect(page).toContain('<DocsNavigationRail');
	});
});

describe('docs page layout', () => {
	test('collapses navigation behind a labelled disclosure below the two-column breakpoint', async () => {
		const navigationRail = await readSource('pages/docs/DocsNavigationRail.tsx');

		// Below the split a 14rem sidebar leaves the article too narrow, so the docs-only links
		// move behind one control instead of stacking above the prose. The condition is the
		// region's own width now, not a viewport tier — see markdown-content for why.
		expect(navigationRail).toContain(
			'<details className="group rounded-xl border border-border bg-card',
		);
		expect(navigationRail).toContain('@min-[45rem]:hidden');
		expect(navigationRail).toContain('<summary');
		expect(navigationRail).toContain('<DisclosureMarker />');
		expect(navigationRail).toContain('<div className="hidden @min-[45rem]:block">');
	});

	test('keeps the article heading out of the body and inside the page header', async () => {
		const page = await readSource('pages/docs/DocsPage.tsx');

		expect(page).toContain('markdownSummary(body)');
		expect(page).toContain('renderMarkdownInline(summary)');
		expect(page).toContain("variant={slug === 'glossary' ? 'glossary' : 'docs'}");
		expect(page).toContain('title={section ? section.title : ');
		expect(page).toContain("breadcrumb: { label: 'Docs'");
	});

	test('gives FAQ pairs their own rhythm and closes every document from the manifest', async () => {
		const [faq, page, pager] = await Promise.all([
			readFile(resolve(FRONTEND_SOURCE, '../content/docs/faq.md'), 'utf8'),
			readSource('pages/docs/DocsPage.tsx'),
			readSource('pages/docs/DocsPager.tsx'),
		]);

		expect(faq).toContain('Answers to common questions about running and operating aidd.');
		expect(page).toContain("className={slug === 'faq' ? FAQ_CONTENT_CLASS : ''}");
		expect(page).toContain("variant={slug === 'glossary' ? 'glossary' : 'docs'}");
		expect(page).toContain('<DocsPager slug={slug} />');
		expect(pager).toContain('aria-label="Documentation pagination"');
		expect(pager).toContain('border-t border-border/60');
		expect(pager).toContain('Previous: {previous.title}');
		expect(pager).toContain('Next: {next.title}');
	});
});

describe('glossary rendering', () => {
	test('renders all 27 shipped terms in five semantic definition groups', async () => {
		const markdown = await readFile(
			resolve(FRONTEND_SOURCE, '../content/docs/glossary.md'),
			'utf8',
		);
		const script = [
			"import { createElement } from 'react';",
			"import { renderToStaticMarkup } from 'react-dom/server';",
			"import { MarkdownContent } from './src/components/shared/MarkdownContent.tsx';",
			`const markdown = ${JSON.stringify(markdown)};`,
			"const el = createElement(MarkdownContent, { baseLevel: 2, markdown, variant: 'glossary' });",
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
		expect(html.match(/<dt\b/g)).toHaveLength(27);
		expect(html.match(/<dd\b/g)).toHaveLength(27);
		expect(html).not.toContain('<ul');
		// The page header carries the title, so the body must not restate it.
		expect(html).not.toContain('>Glossary<');
		expect(html).toContain('id="term-cli"');
		expect(html).toContain('aria-label="Link to term CLI"');
		expect(html).toContain('href="#term-cli"');
	});
});

describe('small pages', () => {
	test('renders the 404 with the house page header and one recovery action', async () => {
		const page = await readSource('pages/notFound/NotFoundPage.tsx');

		expect(page).toContain('<PageHeader');
		expect(page).toContain('title="Page not found"');
		expect(page).toContain('description="The link may be outdated or mistyped."');
		// The recovery action must read against the muted EmptyState surface and lead back into the
		// app; docs remains available as a subordinate recovery action.
		expect(page.match(/buttonClassName\('primary'\)/g)).toHaveLength(1);
		expect(page.match(/buttonClassName\('secondary'\)/g)).toHaveLength(1);
		expect(page).toContain('Go to dashboard');
		expect(page).toContain('Browse the docs');
		expect(page).toContain('smallProseInsetMeasureClass');
		expect(page).not.toContain('proseMeasureCardClass');
	});

	test('gives About a real heading and an honest metadata block', async () => {
		const page = await readSource('pages/about/AboutPage.tsx');

		// The heading is `PageHeader`'s h1, the same as every other route, rather than a
		// hand-rolled one inside a hero section — or no heading at all.
		expect(page).toContain('<PageHeader');
		// And it says "About", matching the rail item that is highlighted while you are here, so no
		// top-level route has an h1 that fails to echo its nav label. The product name stays in
		// the identity card, where it can read as a wordmark without becoming a second heading.
		expect(page).toContain('title="About"');
		expect(page).toContain(
			'description="Product identity and the frontend build this instance is serving."',
		);
		expect(page).toContain('<CardHeader');
		expect(page).toContain('title="aidd"');
		// One muted description register in the header, carried by the slot that declares
		// one. The tagline used to sit in the slot with the sentence explaining it as a
		// sibling paragraph at a different size.
		expect(page).toContain(
			'description="AI Development Director - your local control panel for planning, running, and auditing AI coding work across your projects."',
		);
		expect(page.match(/description=/gu)).toHaveLength(2);
		expect(page).toContain('<Card className="@container" variant="panel">');
		expect(page).not.toContain('proseMeasureCardClass');
		// Raised out of the phone range deliberately: the Card measures 358px at 390x844 and
		// 328px at 360x800, so a 22rem step split one handset class in two. See the comment
		// beside the step for why stacked is the phone branch.
		expect(page).toContain('@min-[28rem]:grid-cols-[5rem_minmax(0,1fr)]');
		expect(page).toContain('h-20 w-20');
		expect(page).not.toContain("buttonClassName('primary')");
		expect(page.match(/buttonClassName\('secondary'\)/gu)).toHaveLength(2);
		expect(page).toContain('__AIDD_BUILD_REVISION__');
		expect(page).toContain('__AIDD_BUILD_TIMESTAMP__');
		expect(page).toContain('__AIDD_VERSION__');
		expect(page).toContain('__AIDD_REPOSITORY_URL__');
		// Each injected value remains separately labelled so the build can be scanned and copied.
		expect(page.match(/<dt /gu)).toHaveLength(3);
		expect(page.match(/<dd /gu)).toHaveLength(3);
		expect(page).toMatch(/>Version<\/dt>\s*<dd[^>]*>\s*\{__AIDD_VERSION__\}\s*<\/dd>/u);
		expect(page).toMatch(/>Revision<\/dt>\s*<dd[^>]*>\s*\{__AIDD_BUILD_REVISION__\}\s*<\/dd>/u);
		expect(page).toMatch(
			/>Built<\/dt>\s*<dd[^>]*>\s*<time[^>]*dateTime=\{__AIDD_BUILD_TIMESTAMP__\}>\s*\{formatDate\(__AIDD_BUILD_TIMESTAMP__\)\}\s*<\/time>\s*<\/dd>/u,
		);
		expect(page).toContain('microLabelClass');
		expect(page).not.toContain("label: 'Interface'");
		expect(page).not.toContain("label: 'Runtime'");
	});

	test('declares every build constant the About page reads', async () => {
		const [types, config] = await Promise.all([
			readSource('types/build-constants.d.ts'),
			readFile(resolve(FRONTEND_SOURCE, '../vite.config.ts'), 'utf8'),
		]);

		expect(types).toContain('declare const __AIDD_BUILD_REVISION__: string;');
		expect(types).toContain('declare const __AIDD_BUILD_TIMESTAMP__: string;');
		expect(types).toContain('declare const __AIDD_REPOSITORY_URL__: string;');
		expect(types).toContain('declare const __AIDD_VERSION__: string;');
		expect(config).toContain('__AIDD_BUILD_REVISION__: JSON.stringify(buildRevision)');
		expect(config).toContain('__AIDD_BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp)');
		expect(config).toContain('const buildTimestamp = new Date().toISOString();');
		expect(config).toContain('__AIDD_REPOSITORY_URL__: JSON.stringify(repositoryUrl)');
		// `git+https://….git` is the clone address; About links a human at the browsable URL.
		expect(config).toContain("replace(/^git\\+/, '').replace(/\\.git$/, '')");
	});

	test('labels every badge-lab section and stops the short catalog cards stretching', async () => {
		const [catalog, lab] = await Promise.all([
			readSource('pages/settings/ExecutionIdentityCatalogSections.tsx'),
			readSource('pages/settings/ExecutionIdentityBadgeLabPage.tsx'),
		]);

		// A label on a generic Card does not make it a group or landmark. Each heading labels the
		// nested section instead, giving all six specimen containers a named region in the
		// accessibility tree.
		expect(catalog).toContain('<Card>');
		expect(catalog).toContain('<section aria-labelledby={id}>');
		expect(catalog).not.toContain('<Card aria-labelledby={id}>');
		for (const id of ['representative', 'constrained', 'status-dots']) {
			expect(lab).toContain(`<section aria-labelledby="badge-lab-${id}"`);
		}
		expect(lab).not.toMatch(/<Card[^>]*aria-labelledby/u);
		// Container steps, not `xl:`. The row reads its own width, so the 736px column at 1024x768
		// gets two columns instead of the single one the viewport breakpoint gave it.
		expect(catalog).toContain(
			'<div className="grid items-start gap-4 @min-[32rem]:grid-cols-2 @min-[61rem]:grid-cols-3">',
		);
		// "Ollama" over "ollama" restated the chip, so the prose label survived only where the
		// display name genuinely differs — which left three of eleven entries carrying a word
		// loose in the wrap flow and eight carrying nothing. Same rule, through the tooltip's
		// `hint` now, so the distinction is still available and every row is one shape.
		expect(catalog).toContain('function cliDisplayTitle');
		expect(catalog).toContain('label.toLowerCase() === cli.toLowerCase()');
		expect(catalog).toContain('hint={cliDisplayTitle(cli)}');
	});
});
