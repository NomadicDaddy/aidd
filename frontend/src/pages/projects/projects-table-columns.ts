import type { SortKey } from './projects-list-sort.ts';

/**
 * Column model for the Projects table.
 *
 * Fourteen columns is roughly 1700px, which does not fit any card the app has. The default view is
 * the six that answer "what is this project and is it healthy right now"; the rest are real but
 * situational, so they are opt-in through the column chooser rather than always present and mostly
 * scrolled off.
 */
export type ProjectColumnKey =
	| 'activeRuns'
	| 'addedAt'
	| 'artifacts'
	| 'features'
	| 'git'
	| 'lastSync'
	| 'maturity'
	| 'name'
	| 'port'
	| 'profile'
	| 'reportedCost'
	| 'stack'
	| 'tokens'
	| 'version';

export interface ProjectColumn {
	key: ProjectColumnKey;
	label: string;
	/** Absent for columns with no meaningful ordering — Active runs is a live link, not a value. */
	sortKey?: SortKey;
}

// Array order is the rendered column order.
export const projectColumns: readonly ProjectColumn[] = [
	{ key: 'name', label: 'Name', sortKey: 'name' },
	{ key: 'version', label: 'Version', sortKey: 'version' },
	{ key: 'activeRuns', label: 'Active runs' },
	{ key: 'port', label: 'Port', sortKey: 'port' },
	{ key: 'stack', label: 'Stack', sortKey: 'stack' },
	{ key: 'profile', label: 'Profile', sortKey: 'profile' },
	{ key: 'features', label: 'Features', sortKey: 'passing' },
	{ key: 'reportedCost', label: 'Reported Cost', sortKey: 'reportedCost' },
	{ key: 'tokens', label: 'Tokens', sortKey: 'tokens' },
	{ key: 'maturity', label: 'Maturity', sortKey: 'maturity' },
	{ key: 'artifacts', label: 'Artifacts', sortKey: 'artifacts' },
	{ key: 'git', label: 'Git', sortKey: 'git' },
	{ key: 'lastSync', label: 'Last Web Run', sortKey: 'lastSync' },
	{ key: 'addedAt', label: 'Added', sortKey: 'addedAt' },
];

/**
 * The orderings the list can express, in table-column order.
 *
 * Both views sort the same array with the same comparator, so the card view's option labels are the
 * table's column labels rather than a second set written by hand — "Features" in the card sort and
 * the Features header are the one `passing` key.
 */
export const projectSortOptions: readonly { key: SortKey; label: string }[] =
	projectColumns.flatMap((column) =>
		column.sortKey ? [{ key: column.sortKey, label: column.label }] : [],
	);

/** Always rendered: identity, what is running, and the three health signals. */
export const defaultProjectColumns: ReadonlySet<ProjectColumnKey> = new Set([
	'activeRuns',
	'features',
	'git',
	'lastSync',
	'maturity',
	'name',
]);

/** The chooser's contents: every column that is not part of the default view. */
export const optionalProjectColumns: readonly ProjectColumn[] = projectColumns.filter(
	(column) => !defaultProjectColumns.has(column.key),
);

const optionalKeys = new Set(optionalProjectColumns.map((column) => column.key));

/**
 * Reads a persisted selection back into column keys. The preference outlives the column list, so an
 * entry that no longer names an optional column is dropped rather than trusted.
 */
export function readOptionalColumns(stored: readonly string[]): ProjectColumnKey[] {
	return optionalProjectColumns
		.map((column) => column.key)
		.filter((key) => stored.includes(key) && optionalKeys.has(key));
}

/** The rendered column set, in table order, for a given optional selection. */
export function visibleProjectColumns(enabled: ReadonlySet<string>): ProjectColumn[] {
	return projectColumns.filter(
		(column) => defaultProjectColumns.has(column.key) || enabled.has(column.key),
	);
}
