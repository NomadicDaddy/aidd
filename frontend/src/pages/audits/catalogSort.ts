import type { AuditDefinition } from '../../api/types.ts';

import { type HealthFilter, healthFor } from './auditsUtils.ts';

/**
 * The catalog's filter and sort, kept out of `CatalogTab` because it is data handling rather than
 * state wiring — and because the sort used to be a hard-coded comparator inside the tab's memo.
 *
 * The catalog was always sorted by change-potential score descending and the ordering was plainly
 * visible (45, 33, 24, 21, …), but nothing on screen said so and nothing let a reader change it.
 * All four numeric headers were plain `<th>` text, on the surface the baseline names as the
 * reference for `SortableColumnHeader` usage. The default here is that same score-descending order,
 * so the initial view is unchanged; it is now labelled and reversible.
 */
export type CatalogSortKey = 'buckets' | 'projects' | 'reports' | 'score';

export interface CatalogSort {
	dir: 'asc' | 'desc';
	key: CatalogSortKey;
}

export const defaultCatalogSort: CatalogSort = { dir: 'desc', key: 'score' };

const sortValues: Record<CatalogSortKey, (item: AuditDefinition) => number> = {
	buckets: (item) => item.applicableBucketCount,
	projects: (item) => item.applicableProjectCount,
	// The Reports column is three numbers, so it needs one to order by. Fresh is the count that
	// carries no action; what a reader sorts this column to find is the audits whose evidence has
	// gone stale or was never produced.
	reports: (item) => item.staleReportCount + item.missingReportCount,
	// An audit with no change potential scores below zero rather than beside the zeroes: it has no
	// score, which is a different fact from having scored nothing.
	score: (item) => item.changePotential?.score ?? -1,
};

/** Toggles direction on the active column and starts a new column descending. */
export function nextCatalogSort(current: CatalogSort, key: CatalogSortKey): CatalogSort {
	if (current.key !== key) return { dir: 'desc', key };
	return { dir: current.dir === 'desc' ? 'asc' : 'desc', key };
}

export function filterAndSortCatalog(
	definitions: AuditDefinition[],
	filters: {
		enabledFilter: 'all' | 'disabled' | 'enabled';
		healthFilter: HealthFilter;
		/** Already lower-cased and trimmed by the caller. */
		query: string;
		sort: CatalogSort;
	},
): AuditDefinition[] {
	const { enabledFilter, healthFilter, query, sort } = filters;
	const matching = definitions.filter((item) => {
		if (query && !`${item.name} ${item.path}`.toLowerCase().includes(query)) return false;
		if (healthFilter !== 'all' && healthFor(item) !== healthFilter) return false;
		if (enabledFilter === 'enabled' && !item.enabled) return false;
		if (enabledFilter === 'disabled' && item.enabled) return false;
		return true;
	});
	const read = sortValues[sort.key];
	// Name is the tiebreak at every sort, so equal values keep one stable order instead of the
	// order the filter happened to leave them in.
	return matching.sort((left, right) => {
		const delta = read(left) - read(right);
		if (delta !== 0) return sort.dir === 'asc' ? delta : -delta;
		return left.name.localeCompare(right.name);
	});
}
