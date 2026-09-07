import { useSearchParams } from 'react-router';

import type { SkillCategoryFilter } from '../../lib/catalogCuration.ts';

import { readSkillCategoryFilter } from '../../lib/catalogCuration.ts';
import { catalogFilterSearchParams, readCatalogQuery } from '../../lib/catalogFilterParams.ts';

/**
 * The Skills catalog's URL-backed filter state: the two parameters it reads and the three writers
 * that change them.
 *
 * `q` and `category` are derived from the query string — the same contract as the Features tab's
 * `featureQ`/`featureStatus` parameters — so a filtered view can be bookmarked, shared, restored,
 * and traversed with browser history. Selection, dialogs, project targets, and launch state stay
 * local to the page on purpose.
 *
 * Split out of `SkillsPage` for the same reason `useFeatureFilterParams` split out of
 * `useFeaturesTab`: this is the one part of the page that touches nothing but the query string,
 * and the page sits at its line ceiling.
 */
export function useSkillsFilterParams() {
	const [searchParams, setSearchParams] = useSearchParams();
	const query = readCatalogQuery(searchParams);
	const category = readSkillCategoryFilter(searchParams.get('category'));

	// Updater form throughout: typing fires one call per keystroke, and keystrokes that land in
	// the same batch all read the same stale copy, so every character but the last would be
	// discarded by a `searchParams` captured at render. `replace`, not push — a query typed a
	// character at a time is one view evolving, not a history entry per character.
	function setQuery(value: string): void {
		setSearchParams((previous) => catalogFilterSearchParams(previous, { q: value }), {
			replace: true,
		});
	}

	function setCategory(value: SkillCategoryFilter): void {
		setSearchParams(
			(previous) =>
				// `all` is the default, so it is removed rather than written as `category=all`.
				catalogFilterSearchParams(previous, { category: value === 'all' ? '' : value }),
			{ replace: true },
		);
	}

	function clearFilters(): void {
		setSearchParams(
			(previous) => catalogFilterSearchParams(previous, { category: '', q: '' }),
			{
				replace: true,
			},
		);
	}

	return { category, clearFilters, query, setCategory, setQuery };
}
