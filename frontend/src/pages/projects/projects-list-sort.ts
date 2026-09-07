import type { ProjectGitStatusMapEntry, ProjectSummary } from '../../api/types.ts';

export type SortKey =
	| 'addedAt'
	| 'artifacts'
	| 'git'
	| 'lastSync'
	| 'maturity'
	| 'name'
	| 'passing'
	| 'port'
	| 'profile'
	| 'reportedCost'
	| 'stack'
	| 'tokens'
	| 'version';
export type SortDir = 'asc' | 'desc';

export const DEFAULT_SORT: SortKey = 'name';
export const DEFAULT_SORT_DIR: SortDir = 'asc';

/* eslint-disable perfectionist/sort-sets -- iteration order defines the UI sort-option/column order */
export const SORT_KEYS: ReadonlySet<SortKey> = new Set([
	'name',
	'version',
	'port',
	'stack',
	'profile',
	'passing',
	'reportedCost',
	'tokens',
	'maturity',
	'artifacts',
	'git',
	'lastSync',
	'addedAt',
]);
/* eslint-enable perfectionist/sort-sets */
export const SORT_DIRS: ReadonlySet<SortDir> = new Set(['asc', 'desc']);

function direction(value: number, dir: SortDir): number {
	return dir === 'asc' ? value : -value;
}

function compareNumber(left: null | number, right: null | number, dir: SortDir): number {
	if (left === right) return 0;
	if (left === null) return 1;
	if (right === null) return -1;
	return direction(left - right, dir);
}

function compareText(left: null | string, right: null | string, dir: SortDir): number {
	if (left === right) return 0;
	if (left === null) return 1;
	if (right === null) return -1;
	return direction(left.localeCompare(right, undefined, { numeric: true }), dir);
}

function timestamp(value: null | string): null | number {
	if (!value) return null;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? null : parsed;
}

function gitSortValue(entry: ProjectGitStatusMapEntry | undefined): null | string {
	if (!entry) return null;
	const { branch, state, total } = entry.status;
	return `${state}|${branch ?? ''}|${total}`;
}

function stackSortValue(project: ProjectSummary): string {
	const stack = project.metadata.stack;
	return [stack.label, ...stack.languages, ...stack.runtimes, ...stack.frameworks].join('|');
}

export function readSortKey(value: null | string): SortKey {
	return value && (SORT_KEYS as Set<string>).has(value) ? (value as SortKey) : DEFAULT_SORT;
}

export function readSortDir(value: null | string): SortDir {
	return value && (SORT_DIRS as Set<string>).has(value) ? (value as SortDir) : DEFAULT_SORT_DIR;
}

export function compareProjects(
	left: ProjectSummary,
	right: ProjectSummary,
	key: SortKey,
	dir: SortDir = 'asc',
	gitStatus?: Record<string, ProjectGitStatusMapEntry>,
): number {
	let result: number;
	switch (key) {
		case 'addedAt':
			result = compareNumber(
				timestamp(left.metadata.addedAt),
				timestamp(right.metadata.addedAt),
				dir,
			);
			break;
		case 'artifacts':
			result = compareText(left.artifactHealth, right.artifactHealth, dir);
			break;
		case 'git':
			result = compareText(
				gitSortValue(gitStatus?.[left.id]),
				gitSortValue(gitStatus?.[right.id]),
				dir,
			);
			break;
		case 'lastSync':
			result = compareNumber(
				timestamp(left.metadata.sync.lastSyncAt),
				timestamp(right.metadata.sync.lastSyncAt),
				dir,
			);
			break;
		case 'maturity':
			result = compareNumber(
				left.metadata.maturity.percent,
				right.metadata.maturity.percent,
				dir,
			);
			break;
		case 'passing':
			result = compareNumber(left.featureStats.passing, right.featureStats.passing, dir);
			break;
		case 'port':
			result = compareNumber(
				left.metadata.ports?.frontendPort ?? left.metadata.ports?.backendPort ?? null,
				right.metadata.ports?.frontendPort ?? right.metadata.ports?.backendPort ?? null,
				dir,
			);
			break;
		case 'profile':
			result = compareText(left.metadata.profile.bucket, right.metadata.profile.bucket, dir);
			break;
		case 'reportedCost':
			result = compareNumber(
				left.metadata.usage.totals.reportedCostUsd,
				right.metadata.usage.totals.reportedCostUsd,
				dir,
			);
			break;
		case 'stack':
			result = compareText(stackSortValue(left), stackSortValue(right), dir);
			break;
		case 'tokens':
			result = compareNumber(
				left.metadata.usage.totals.totalTokens,
				right.metadata.usage.totals.totalTokens,
				dir,
			);
			break;
		case 'version':
			result = compareText(left.metadata.appVersion, right.metadata.appVersion, dir);
			break;
		case 'name':
		default:
			result = compareText(left.name, right.name, dir);
			break;
	}
	return result !== 0 ? result : compareText(left.name, right.name, dir);
}
