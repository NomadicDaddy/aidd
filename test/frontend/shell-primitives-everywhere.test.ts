import { FRONTEND_ROUTE_IDS } from 'aidd-shared/contracts/frontend-routes';
import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

import { formatFilesystemPath } from '../../frontend/src/lib/formatters.ts';

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
		// matched three of twenty-one would make every check in this file vacuous.
		expect(new Set(ids)).toEqual(new Set(FRONTEND_ROUTE_IDS));
		expect(ids.length).toBe(21);
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
		// which every other top-level route already did. The product name moved to the description,
		// where a page says what it is rather than repeating the wordmark 234px to its left.
		expect(about).toContain('title="About"');
		// The mark stays, but decorative: the accessible name for the page now comes from the
		// PageHeader h1 rather than from an img's alt text doing double duty as the heading.
		expect(about).toContain('alt=""');
		expect(about).toContain('page-reveal space-y-5');
		// It used to centre itself in its own column at its own vertical rhythm, so navigating to
		// it moved every landmark on screen.
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
		'frontend/src/pages/notFound/NotFoundPage.tsx',
		'frontend/src/pages/recipes/detail/RecipeNotFound.tsx',
	];

	test('both not-found surfaces use EmptyState and a secondary action', async () => {
		for (const page of pages) {
			const source = await read(page);
			expect(source, page).toContain('<EmptyState');
			// A solid Card with a filled accent button reads as an emphasised piece of content
			// rather than as an absence; the dashed muted inset is what the rest of the app uses
			// for the same situation.
			expect(source, page).not.toContain("from '../../components/ui/card.tsx'");
			expect(source, page).not.toContain("from '../../../components/ui/card.tsx'");
			expect(source, page).toContain("buttonClassName('secondary')");
		}
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
		file: 'frontend/src/pages/projects/ProjectIngestLane.tsx',
		why: 'card-to-transparent fade marking that the scroller has more content below the fold',
	},
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

describe('one path renders one way', () => {
	test('normalisation and the monospace face live in the same component', async () => {
		const component = await read('frontend/src/components/shared/FilePath.tsx');

		// Splitting these is how one directory rendered as `d:\applications\aidd` in the sans face
		// on one page and `D:/applications/aidd` in mono two clicks away.
		expect(component).toContain('formatFilesystemPath');
		expect(component).toContain("'font-mono'");
		// A truncated path stays recoverable on hover; the class that truncates it belongs to the
		// caller, because only the caller knows its column. `title ?? display` rather than a bare
		// `display`: the audits catalog renders a basename in a narrow column, so what its hover
		// has to recover is the full path the cell is no longer showing. The fallback is what
		// matters here — a caller that says nothing still gets the whole displayed value back.
		expect(component).toContain('title={title ?? display}');
	});

	test('the normaliser settles case, separators and trailing slashes', () => {
		const B = String.fromCharCode(92);

		expect(formatFilesystemPath(`d:${B}applications${B}aidd`)).toBe('D:/applications/aidd');
		expect(formatFilesystemPath('D:/applications/aidd/')).toBe('D:/applications/aidd');
		// A drive root IS its trailing separator; stripping it would produce `D:`, which names the
		// current directory on that drive rather than its root.
		expect(formatFilesystemPath(`C:${B}`)).toBe('C:/');
		// The leading double separator of a UNC path is load-bearing, not cosmetic.
		expect(formatFilesystemPath(`${B}${B}server${B}share${B}x`)).toBe('//server/share/x');
		expect(formatFilesystemPath('/srv/aidd/')).toBe('/srv/aidd');
		expect(formatFilesystemPath(null)).toBe('');
		expect(formatFilesystemPath(undefined)).toBe('');
	});

	test('no page renders a project path as bare text', async () => {
		/**
		 * The one place a raw path is correct. The typed confirmation is posted to the backend and
		 * compared byte-exact against the stored path, so a normalised placeholder would show the
		 * user a string that cannot be typed to satisfy the check.
		 */
		const exempt = new Set(['frontend/src/pages/projects/detail/DeleteProjectCard.tsx']);
		const offenders: string[] = [];

		for await (const relative of new Bun.Glob('frontend/src/pages/**/*.tsx').scan(ROOT)) {
			const file = relative.replaceAll('\\', '/');
			if (exempt.has(file)) continue;
			const source = stripComments(await read(file));
			// A path interpolated as an element's own CHILD. The lookbehind drops every
			// `something={project.path}` — passing the value to a prop is how it reaches FilePath,
			// a `title`, or a `<select>` option's submitted value in the first place — and every
			// `${project.path}`, which is a template hole in a filter string, not a render.
			for (const [match] of source.matchAll(
				/(?<![=\w$])\{(?:selectedLaunchProject|project|detail|candidate)\.path\}/g,
			)) {
				offenders.push(`${file}: ${match}`);
			}
		}
		expect(offenders).toEqual([]);
	});

	test('the delete confirmation is exempt for the reason claimed', async () => {
		const card = await read('frontend/src/pages/projects/detail/DeleteProjectCard.tsx');

		expect(card).toContain('placeholder={project.path}');
		// If the typed value ever stopped being compared against the raw path, the exemption would
		// have to go with it.
		expect(card).toContain('project.path');
	});
});
