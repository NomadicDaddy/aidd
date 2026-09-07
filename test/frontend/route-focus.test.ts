import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import { shouldFocusMainOnNavigation } from '../../frontend/src/components/layout/route-focus.ts';

const srcRoot = join(process.cwd(), 'frontend', 'src');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(srcRoot, ...segments)).text();
}

function stripComments(source: string): string {
	return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

describe('shouldFocusMainOnNavigation', () => {
	test('a genuine in-app navigation moves focus to the landmark', () => {
		expect(
			shouldFocusMainOnNavigation({
				navigationType: 'PUSH',
				nextPathname: '/projects',
				previousPathname: '/runs',
			}),
		).toBe(true);
	});

	test('back and forward move focus too', () => {
		// A POP is the operator navigating, same as a click. Only the very first render is a
		// landing, and that is caught by the null below, not by the navigation type.
		expect(
			shouldFocusMainOnNavigation({
				navigationType: 'POP',
				nextPathname: '/runs',
				previousPathname: '/projects',
			}),
		).toBe(true);
	});

	test('the first render is left alone', () => {
		for (const navigationType of ['POP', 'PUSH', 'REPLACE'] as const) {
			expect(
				shouldFocusMainOnNavigation({
					navigationType,
					nextPathname: '/runs',
					previousPathname: null,
				}),
			).toBe(false);
		}
	});

	test('a redirect stub does not drag the viewport down', () => {
		// `/pipeline-sessions` renders `<Navigate replace to="/runs">`. The stub is the first
		// pathname, so the first-render guard is spent on a page nobody sees, and /runs arrives as
		// a second navigation. Focusing it scrolled a 390x844 load to scrollY=125 — the exact
		// height of the sticky mobile header — hiding the "Runs" title behind it.
		expect(
			shouldFocusMainOnNavigation({
				navigationType: 'REPLACE',
				nextPathname: '/runs',
				previousPathname: '/pipeline-sessions',
			}),
		).toBe(false);
		// `/docs` redirects the same way.
		expect(
			shouldFocusMainOnNavigation({
				navigationType: 'REPLACE',
				nextPathname: '/docs/getting-started',
				previousPathname: '/docs',
			}),
		).toBe(false);
	});

	test('a tab or filter change on the current page keeps focus where it is', () => {
		// Audits, Project Detail and the features table all navigate to change a query string, and
		// `useCanonicalProjectRoute` rewrites in place. Every one of those keeps the same pathname,
		// and stealing focus from the control just operated would also scroll the page under it.
		for (const navigationType of ['PUSH', 'REPLACE'] as const) {
			expect(
				shouldFocusMainOnNavigation({
					navigationType,
					nextPathname: '/audits',
					previousPathname: '/audits',
				}),
			).toBe(false);
		}
	});
});

describe('the route-change focus effect asks that predicate', () => {
	test('App.tsx decides through shouldFocusMainOnNavigation, not an inline condition', async () => {
		const app = stripComments(await read('App.tsx'));

		expect(app).toContain("from './components/layout/route-focus.ts'");
		expect(app).toContain('shouldFocusMainOnNavigation({');
		// The predicate needs the navigation type to tell a redirect from a click, and the previous
		// pathname to tell a page change from a query-string change. An effect keyed on the
		// pathname alone cannot see either.
		expect(app).toContain('const navigationType = useNavigationType()');
		expect(app).toContain('lastPathnameRef.current = location.pathname');
		expect(app).toMatch(/\}, \[location\.pathname, navigationType\]\)/);
	});

	test('the landmark is focused in exactly one place', async () => {
		const glob = new Bun.Glob('**/*.{ts,tsx}');
		const focusers: string[] = [];

		for await (const file of glob.scan({ absolute: false, cwd: srcRoot, onlyFiles: true })) {
			const source = stripComments(await Bun.file(join(srcRoot, file)).text());
			if (source.includes("getElementById('main-content')?.focus()")) {
				focusers.push(file.replaceAll('\\', '/'));
			}
		}

		// A second call site would re-introduce the scroll jump without going through the predicate,
		// and it would do it somewhere nobody thinks to look.
		expect(focusers).toEqual(['App.tsx']);
	});

	test('the skip link still has a landmark to reach', async () => {
		const layout = await read('components', 'layout', 'AppLayout.tsx');

		// Focus moves by id and the skip link targets the same id; the landmark also has to be
		// focusable at all, which is what tabIndex={-1} on a non-interactive element buys.
		expect(layout).toContain('href="#main-content"');
		expect(layout).toContain('id="main-content"');
		expect(layout).toMatch(/id="main-content"[\s\S]{0,400}tabIndex=\{-1\}/);
	});
});
