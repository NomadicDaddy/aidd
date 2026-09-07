import { FRONTEND_ROUTE_IDS } from 'aidd-shared/contracts/frontend-routes';
import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');

function read(path: string): Promise<string> {
	return Bun.file(join(ROOT, path)).text();
}

/**
 * Strips comments before scanning for class names.
 *
 * Deliberately not line-based. A `{/* ... *\/}` block whose middle lines mention a banned class is
 * still a comment, and a per-line stripper that only recognises `//` and `/*` openers counts those
 * continuation lines as code — which is exactly how a note explaining why a gradient was REMOVED
 * would fail the test that checks the gradient is gone.
 */
function stripComments(source: string): string {
	return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

const APP = 'frontend/src/App.tsx';

/** Page modules that render their shell through a child rather than inline, and which child. */
const HEADER_DELEGATES: Record<string, string[]> = {
	'frontend/src/pages/recipes/RecipeCreatePage.tsx': [
		'frontend/src/pages/recipes/detail/RecipeEditMode.tsx',
	],
	'frontend/src/pages/recipes/RecipeDetailPage.tsx': [
		'frontend/src/pages/recipes/detail/RecipeEditMode.tsx',
		'frontend/src/pages/recipes/detail/RecipeNotFound.tsx',
		'frontend/src/pages/recipes/detail/RecipeOverviewMode.tsx',
	],
};

/**
 * Reads App.tsx's route table rather than a hand-kept list, so a route added tomorrow is covered
 * by this test the day it is added instead of the day someone remembers to update the array.
 */
async function routePageModules(): Promise<Map<string, string>> {
	const app = await read(APP);
	const modules = new Map<string, string>();
	for (const match of app.matchAll(/const (\w+) = lazy\(\(\) =>\s*import\('(\.[^']+)'\)/g)) {
		modules.set(match[1]!, `frontend/src/${match[2]!.replace(/^\.\//, '')}`);
	}
	// NotFoundPage is imported eagerly — it is the fallback route, so code-splitting it would
	// mean a chunk fetch on the one navigation most likely to be offline or mistyped.
	for (const match of app.matchAll(/import \{ (\w+Page) \} from '(\.[^']+)'/g)) {
		modules.set(match[1]!, `frontend/src/${match[2]!.replace(/^\.\//, '')}`);
	}

	const table = /const routeElements[^{]*\{([\s\S]*?)\n\};/.exec(app)?.[1];
	expect(table).toBeDefined();
	const byRoute = new Map<string, string>();
	for (const match of table!.matchAll(/^\t(\w+): (.+?),$/gm)) {
		const id = match[1]!;
		const element = match[2]!;
		// `<Navigate replace to=.../>` entries are redirects: they render no page of their own.
		if (element.startsWith('<Navigate')) continue;
		const component = /^<(\w+)/.exec(element)?.[1];
		expect(component, `route ${id} renders something this parser cannot read`).toBeDefined();
		const module = modules.get(component!);
		expect(module, `no module found for ${component!} (route ${id})`).toBeDefined();
		byRoute.set(id, module!);
	}
	return byRoute;
}

describe('every route opens with the same shell', () => {
	test('the route table covers every declared route id', async () => {
		const app = await read(APP);
		const table = /const routeElements[^{]*\{([\s\S]*?)\n\};/.exec(app)?.[1] ?? '';
		const ids = [...table.matchAll(/^\t(\w+): /gm)].map((match) => match[1]!);

		// `routeElements` is typed `Record<FrontendRouteId, ReactNode>`, so tsc already rejects a
		// missing key. This asserts the parser above sees all of them — a regex that silently
		// matched three of twenty-two would make every check in this file vacuous.
		expect(new Set(ids)).toEqual(new Set(FRONTEND_ROUTE_IDS));
		expect(ids.length).toBe(22);
	});

	test('every route page renders PageHeader', async () => {
		const byRoute = await routePageModules();
		expect(byRoute.size).toBeGreaterThan(15);

		const missing: string[] = [];
		for (const [id, module] of byRoute) {
			const sources = await Promise.all(
				[module, ...(HEADER_DELEGATES[module] ?? [])].map((file) => read(file)),
			);
			if (!sources.some((source) => source.includes('<PageHeader'))) {
				missing.push(`${id} (${module})`);
			}
		}
		expect(missing).toEqual([]);
	});

	test('every delegate named above really is one', async () => {
		// Guards the escape hatch: a delegate entry is only honest if the page actually renders it.
		for (const [module, delegates] of Object.entries(HEADER_DELEGATES)) {
			const source = await read(module);
			for (const delegate of delegates) {
				const component = delegate.split('/').pop()!.replace('.tsx', '');
				expect(source, `${module} does not render ${component}`).toContain(`<${component}`);
			}
		}
	});
});

describe('About is a page, not a splash screen', () => {
	test('its title is text in the header, not a logo image', async () => {
		const about = stripComments(await read('frontend/src/pages/about/AboutPage.tsx'));

		expect(about).toContain('<PageHeader');
		// "About", not "aidd": the h1 echoes the nav item that is highlighted while you are here,
		// while the nameplate's CardHeader emits the subordinate product-identity h2.
		expect(about).toContain('title="About"');
		expect(about).toContain('<CardHeader');
		// The mark stays, but decorative: the accessible name for the page now comes from the
		// PageHeader h1 rather than from an img's alt text doing double duty as the heading.
		expect(about).toContain('alt=""');
		expect(about).toContain('page-reveal space-y-5');
		expect(about).not.toContain('mx-auto');
		// A page centring itself in its own column at its own vertical rhythm moves every landmark
		// on screen when navigated to.
		expect(about).not.toContain('max-w-4xl');
		expect(about).not.toContain('min-h-[calc(');
	});

	test('the hero treatment is gone', async () => {
		const about = stripComments(await read('frontend/src/pages/about/AboutPage.tsx'));

		expect(about).not.toContain('gradient');
		expect(about).not.toContain('blur-');
		expect(about).not.toContain('shadow-lg');
	});
});

describe('an absence renders as the house absence block', () => {
	const pages = [
		'frontend/src/pages/docs/DocsNotFound.tsx',
		'frontend/src/pages/notFound/NotFoundPage.tsx',
		'frontend/src/pages/recipes/detail/RecipeNotFound.tsx',
	];

	test('not-found surfaces use EmptyState with recovery emphasis suited to their scope', async () => {
		for (const page of pages) {
			const source = await read(page);
			expect(source, page).toContain('<EmptyState');
			expect(source, page).not.toContain("from '../../components/ui/card.tsx'");
			expect(source, page).not.toContain("from '../../../components/ui/card.tsx'");
		}

		const docsNotFound = await read(pages[0] ?? '');
		const pageNotFound = await read(pages[1] ?? '');
		const recipeNotFound = await read(pages[2] ?? '');
		expect(docsNotFound).toContain("buttonClassName('primary')");
		expect(docsNotFound).toContain('Back to Getting started');
		expect(pageNotFound).toContain("buttonClassName('primary')");
		expect(pageNotFound).toContain('Go to dashboard');
		expect(recipeNotFound).toContain("buttonClassName('secondary')");
	});

	test('the recipe not-found state keeps the page title in the header', async () => {
		const source = await read('frontend/src/pages/recipes/detail/RecipeNotFound.tsx');

		expect(source).toContain('<PageHeader');
		// It had its own `h1` inside a Card, so the title moved and changed size depending on
		// whether the recipe existed.
		expect(source).not.toContain('<h1');
	});
});

/**
 * Chrome that floats above the page — dialogs, popovers, drawers, the sticky header — legitimately
 * casts a shadow and blurs what is behind it; that is how a layer reads as a layer. Page CONTENT
 * does not, and the exemptions below are the page-level uses that are functional rather than
 * decorative. An unlisted one fails.
 */
const SURFACE_EXEMPTIONS: { file: string; why: string }[] = [
	{
		file: 'frontend/src/pages/runs/LiveConsole.tsx',
		why: 'jump-to-latest button floats over the transcript it scrolls, so it needs to read as above it',
	},
	{
		file: 'frontend/src/pages/projects/ProjectTableRow.tsx',
		why: 'the pinned name cell needs its hover tint in the background-image layer: bg-card is what stops scrolled columns showing through it, so a translucent hover background-color would replace the very fill that makes the cell opaque',
	},
];

describe('no route decorates itself beyond the card border', () => {
	test('page content carries no gradient, blur or drop shadow', async () => {
		const exempt = new Set(SURFACE_EXEMPTIONS.map((entry) => entry.file));
		const offenders: string[] = [];

		for await (const relative of new Bun.Glob('frontend/src/pages/**/*.tsx').scan(ROOT)) {
			const file = relative.replaceAll('\\', '/');
			if (exempt.has(file)) continue;
			const source = stripComments(await read(file));
			for (const [, match] of source.matchAll(/(gradient|blur-|shadow-(?:lg|xl|2xl))/g)) {
				offenders.push(`${file}: ${match}`);
			}
		}
		expect(offenders).toEqual([]);
	});

	test('each exemption is a real file and still uses what it is exempted for', async () => {
		for (const { file, why } of SURFACE_EXEMPTIONS) {
			const source = stripComments(await read(file));
			expect(source, `${file} no longer needs its exemption: ${why}`).toMatch(
				/gradient|blur-|shadow-(?:lg|xl|2xl)/,
			);
		}
	});
});
