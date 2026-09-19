import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import {
	projectDetailTabSearchParams,
	readProjectDetailTab,
} from '../../frontend/src/pages/projects/detail/projectDetailNavigation.ts';
import {
	MATURITY_FILTERS,
	PHASES,
	PROFILE_BUCKETS,
} from '../../frontend/src/pages/projects/projects-list-shared.ts';
import { SORT_DIRS, SORT_KEYS } from '../../frontend/src/pages/projects/projects-list-sort.ts';
import {
	normalizeFilterParams,
	PROJECT_FILTER_KEYS,
	unrecognizedFilterKeys,
} from '../../frontend/src/pages/projects/projectsFilterParams.ts';

const FRONTEND_SRC = resolve(import.meta.dir, '../../frontend/src');
const ROOTS = new Set(['D:/applications', 'D:/websites']);

function params(search: string): URLSearchParams {
	return new URLSearchParams(search);
}

function normalized(search: string, roots: null | ReadonlySet<string> = ROOTS): string {
	return (normalizeFilterParams(params(search), roots) ?? params(search)).toString();
}

async function frontendSource(file: string): Promise<string> {
	return await Bun.file(resolve(FRONTEND_SRC, file)).text();
}

// The defect: an unrecognized filter value survived in the address bar while the read path collapsed
// it to 'all'. The page filtered nothing, hasFilters was computed from the collapsed values and so
// read false, and the Reset control that would have cleared the parameter reported nothing to clear.
// The stored copy then replayed onto the next bare /projects visit.
describe('a filter value the surface cannot act on does not survive in the URL', () => {
	test('an unrecognized value is dropped, and every recognized one is kept', () => {
		expect(unrecognizedFilterKeys(params('profile=bogus'), ROOTS)).toEqual(['profile']);
		expect(unrecognizedFilterKeys(params('phase=nope'), ROOTS)).toEqual(['phase']);
		expect(unrecognizedFilterKeys(params('maturity=nope'), ROOTS)).toEqual(['maturity']);
		expect(unrecognizedFilterKeys(params('sort=nope&dir=sideways'), ROOTS)).toEqual([
			'dir',
			'sort',
		]);

		// Stated from the other side too. A normalizer that dropped everything would satisfy the
		// assertions above and leave the page unable to filter at all, so every member of every
		// allowlist is checked to survive its own pass.
		const allowlists = [
			['dir', SORT_DIRS],
			['maturity', MATURITY_FILTERS],
			['phase', PHASES],
			['profile', PROFILE_BUCKETS],
			['sort', SORT_KEYS],
		] as const;
		let checked = 0;
		let expected = 0;
		for (const [key, allowed] of allowlists) {
			for (const value of allowed) {
				// MATURITY_FILTERS carries its own no-filter member; the test below owns that case.
				if (value === 'all') continue;
				expected += 1;
				expect(unrecognizedFilterKeys(params(`${key}=${value}`), ROOTS)).toEqual([]);
				checked += 1;
			}
		}
		// Pinned so a table that stopped iterating passes nothing rather than passing vacuously.
		expect(checked).toBe(expected);
		expect(checked).toBeGreaterThan(20);
	});

	test('the no-filter value is dropped, because the surface itself never writes it', () => {
		// updateParam deletes a key rather than setting it to 'all', so a hand-typed ?profile=all is
		// a filter the toolbar cannot show as active either — the same disagreement, one step milder.
		expect(normalized('profile=all&q=aidd')).toBe('q=aidd');
		expect(normalized('root=all')).toBe('');
		// MATURITY_FILTERS lists 'all' as a member, so this one is dropped despite being in its set.
		expect(normalized('maturity=all&q=aidd')).toBe('q=aidd');
		expect(normalized('maturity=shipped')).toBe('maturity=shipped');
	});

	test('free-text filters have no allowlist to fall outside of, and are left alone', () => {
		// A search string is whatever was typed, and a milestone name is whatever the projects on
		// disk declare. Neither is normalized on the read path, so neither is normalized here.
		expect(normalized('q=%3Cscript%3E&milestone=v99.0')).toBe('q=%3Cscript%3E&milestone=v99.0');
		expect(unrecognizedFilterKeys(params('milestone=all'), ROOTS)).toEqual([]);
	});

	test('a root is judged only once its options are known', () => {
		// The root allowlist is data, not a constant. Checking a perfectly good root against an
		// empty set before the project list loads would strip it for being early.
		expect(unrecognizedFilterKeys(params('root=D:/nowhere'), null)).toEqual([]);
		expect(unrecognizedFilterKeys(params('root=D:/nowhere'), new Set())).toEqual(['root']);
		expect(unrecognizedFilterKeys(params('root=D:/nowhere'), ROOTS)).toEqual(['root']);
		expect(unrecognizedFilterKeys(params('root=D:/websites'), ROOTS)).toEqual([]);
	});

	test('a clean URL normalizes to null, so nothing navigates', () => {
		// The hook calls setSearchParams only on a non-null result. Returning fresh params for an
		// already-clean URL would replace the history entry on every params change.
		expect(normalizeFilterParams(params('q=aidd&profile=single_user_local'), ROOTS)).toBeNull();
		expect(normalizeFilterParams(params(''), ROOTS)).toBeNull();
		expect(normalizeFilterParams(params('profile=bogus'), ROOTS)).not.toBeNull();
	});

	test('a retired filter key is stripped even when its value was once valid', () => {
		// The toolbar used to filter on sync state. Bookmarks and stored URLs that still carry
		// ?sync= must not keep a param the surface no longer reads.
		expect(normalized('sync=idle&q=aidd')).toBe('q=aidd');
		expect(normalizeFilterParams(params('sync=idle'), ROOTS)).not.toBeNull();
	});
});

describe('one allowlist, not two', () => {
	test('every filter the read path collapses is a filter this module strips', async () => {
		const hook = await frontendSource('pages/projects/useProjectsFilters.ts');

		// The read path narrows a raw param by asking a Set whether it has the value. Each set it
		// names there has to appear in this module's table, or the two derivations disagree again
		// and the surface goes back to filtering on one answer while reporting another.
		const readPathSets = hook
			.split(' as Set<string>).has(')
			.slice(0, -1)
			.map((chunk) => chunk.slice(chunk.lastIndexOf('(') + 1));
		expect(readPathSets.slice().sort()).toEqual([
			'MATURITY_FILTERS',
			'PHASES',
			'PROFILE_BUCKETS',
		]);

		const table = await frontendSource('pages/projects/projectsFilterParams.ts');
		for (const set of readPathSets) {
			expect(table).toContain(set);
		}

		// Root is narrowed against rootOptions rather than a constant set, so it is checked by name.
		expect(hook).toContain('rootOptions.some((option) => option.path === rootFilterRaw)');
		expect(table).toContain("params.get('root')");
	});

	test('the store is written from the normalized params, never from the raw ones', async () => {
		const hook = await frontendSource('pages/projects/useProjectsFilters.ts');

		// Stripping the URL alone would still leave one tick in which the raw value sat in the prefs
		// store, and a tab closed in that tick keeps it. Both happen in one pass instead.
		expect(hook).toContain('const stored = normalized ?? searchParams;');
		expect(hook).not.toContain("dir: searchParams.get('dir')");
		expect(hook).toContain("dir: stored.get('dir')");
	});

	test('an empty successful project result supplies a known empty root allowlist', async () => {
		const hook = await frontendSource('pages/projects/useProjectsFilters.ts');
		const page = await frontendSource('pages/projects/ProjectsPage.tsx');

		expect(page).toContain('projects.data !== undefined,');
		expect(hook).toContain('rootOptionsKnown: boolean,');
		expect(hook).toContain("new Set(rootPathKey === '' ? [] : rootPathKey.split('\\n'))");
	});

	test('the hydration replay reads the same key list the normalizer covers', () => {
		// Hydration writes every stored key back onto a bare /projects URL, so a key it replays that
		// the normalizer does not cover is a route back to the original defect.
		expect(PROJECT_FILTER_KEYS.slice().sort()).toEqual([
			'dir',
			'maturity',
			'milestone',
			'phase',
			'profile',
			'q',
			'root',
			'sort',
		]);
	});
});

describe('an unrecognized project-detail tab does not survive in the URL', () => {
	test('the fallback to Overview is matched by dropping the parameter', () => {
		// readProjectDetailTab already rendered Overview for these; the parameter stayed behind, so
		// a copied link named a tab the page was not showing.
		expect(readProjectDetailTab('bogus')).toBe('overview');
		expect(projectDetailTabSearchParams(params('tab=bogus&q=x'), 'overview').toString()).toBe(
			'q=x',
		);

		// From the other side: a recognized tab is still written and still read back.
		expect(readProjectDetailTab('runs')).toBe('runs');
		expect(projectDetailTabSearchParams(params(''), 'runs').toString()).toBe('tab=runs');
	});
});
