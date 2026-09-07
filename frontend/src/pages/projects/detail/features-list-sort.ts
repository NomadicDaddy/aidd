import type { ProjectFeature, ProjectRoadmapSummary } from '../../../api/types.ts';

import { compareFeaturesByTitle } from './featureSearchUtils.ts';
import {
	FEATURE_STATUS_OPTIONS,
	featureShippedVersion,
	featureSourceLabel,
} from './featuresUtils.ts';
import { featureAddedAt, featureCompletedAt } from './featureTimestamps.ts';
import { featureSourceDisplayLabel, stringValue } from './shared.ts';

export type FeatureSortKey =
	'added' | 'completed' | 'milestone' | 'priority' | 'shipped' | 'source' | 'status' | 'title';
export type FeatureSortDir = 'asc' | 'desc';

export const DEFAULT_FEATURE_SORT: FeatureSortKey = 'title';
export const DEFAULT_FEATURE_SORT_DIR: FeatureSortDir = 'asc';

/**
 * The orderings this tab can express, in the order its columns declare them.
 *
 * One array rather than the Projects page's hand-ordered `SORT_KEYS` set plus a separately-declared
 * options list: the `<thead>`, the mobile `CardSortControl` and the URL validator all read this, so
 * a column header and its card option cannot drift into naming different things — and the iteration
 * order that defines the UI comes for free, without the `perfectionist/sort-sets` suppression the
 * set form needs.
 */
export const FEATURE_SORT_COLUMNS: readonly { key: FeatureSortKey; label: string }[] = [
	{ key: 'title', label: 'Feature' },
	{ key: 'status', label: 'Status' },
	{ key: 'shipped', label: 'Shipped' },
	{ key: 'milestone', label: 'Milestone' },
	{ key: 'priority', label: 'Priority' },
	{ key: 'source', label: 'Source' },
	{ key: 'added', label: 'Added' },
	{ key: 'completed', label: 'Completed' },
];

const FEATURE_SORT_KEYS: ReadonlySet<string> = new Set(
	FEATURE_SORT_COLUMNS.map((column) => column.key),
);
const FEATURE_SORT_DIRS: ReadonlySet<string> = new Set(['asc', 'desc']);

function direction(value: number, dir: FeatureSortDir): number {
	return dir === 'asc' ? value : -value;
}

// Nulls sort last in both directions, as they do on the Projects list: a feature with no
// completion date is not "the oldest completion", and floating the em-dash rows to the top of a
// descending sort would bury the column's whole point.
function compareNumber(left: null | number, right: null | number, dir: FeatureSortDir): number {
	if (left === right) return 0;
	if (left === null) return 1;
	if (right === null) return -1;
	return direction(left - right, dir);
}

function compareText(left: null | string, right: null | string, dir: FeatureSortDir): number {
	if (left === right) return 0;
	if (left === null) return 1;
	if (right === null) return -1;
	return direction(left.localeCompare(right, undefined, { numeric: true }), dir);
}

/** Lifecycle rank, not alphabetical: the column reads `Backlog → Completed` in the order the work
 *  actually moves, and the cell renders humanized text the raw enum would not collate with anyway.
 *  An invalid status — the red badge `statusTone` paints — has no lifecycle position and sorts last. */
function statusRank(feature: ProjectFeature): null | number {
	const index = (FEATURE_STATUS_OPTIONS as readonly string[]).indexOf(
		stringValue(feature, 'status'),
	);
	return index === -1 ? null : index;
}

/** Roadmap position, so M2 precedes M10 because the roadmap says so and not because of string
 *  collation. A milestone the roadmap does not declare ranks after every one it does. */
function milestoneRank(
	feature: ProjectFeature,
	roadmap: null | ProjectRoadmapSummary,
): null | number {
	const milestone = stringValue(feature, 'milestone');
	if (!milestone) return null;
	const order = roadmap?.milestoneOrder ?? Object.keys(roadmap?.milestones ?? {});
	const index = order.indexOf(milestone);
	return index === -1 ? order.length : index;
}

/** Matches `featurePriorityValue`: a non-numeric priority is unassigned, not priority zero. */
function priorityRank(feature: ProjectFeature): null | number {
	return typeof feature.priority === 'number' ? feature.priority : null;
}

export function readFeatureSortKey(value: null | string): FeatureSortKey {
	return value && FEATURE_SORT_KEYS.has(value) ? (value as FeatureSortKey) : DEFAULT_FEATURE_SORT;
}

export function readFeatureSortDir(value: null | string): FeatureSortDir {
	return value && FEATURE_SORT_DIRS.has(value)
		? (value as FeatureSortDir)
		: DEFAULT_FEATURE_SORT_DIR;
}

export function compareFeatures(
	left: ProjectFeature,
	right: ProjectFeature,
	key: FeatureSortKey,
	dir: FeatureSortDir = 'asc',
	roadmap?: null | ProjectRoadmapSummary,
): number {
	let result: number;
	switch (key) {
		case 'added':
			result = compareNumber(
				featureAddedAt(left)?.timeValue ?? null,
				featureAddedAt(right)?.timeValue ?? null,
				dir,
			);
			break;
		case 'completed':
			result = compareNumber(
				featureCompletedAt(left)?.timeValue ?? null,
				featureCompletedAt(right)?.timeValue ?? null,
				dir,
			);
			break;
		case 'milestone':
			result = compareNumber(
				milestoneRank(left, roadmap ?? null),
				milestoneRank(right, roadmap ?? null),
				dir,
			);
			// Two milestones the roadmap does not know share a rank; fall back to their names so
			// the off-roadmap tail is still ordered rather than arbitrary.
			if (result === 0) {
				result = compareText(
					stringValue(left, 'milestone') || null,
					stringValue(right, 'milestone') || null,
					dir,
				);
			}
			break;
		case 'priority':
			result = compareNumber(priorityRank(left), priorityRank(right), dir);
			break;
		case 'shipped':
			result = compareText(featureShippedVersion(left), featureShippedVersion(right), dir);
			break;
		case 'source':
			result = compareText(
				featureSourceDisplayLabel(featureSourceLabel(left)),
				featureSourceDisplayLabel(featureSourceLabel(right)),
				dir,
			);
			break;
		case 'status':
			result = compareNumber(statusRank(left), statusRank(right), dir);
			break;
		case 'title':
		default:
			result = direction(compareFeaturesByTitle(left, right), dir);
			break;
	}
	// The tiebreaker stays ascending, unlike `compareProjects` which passes `dir` into its name
	// fallback. `compareFeaturesByTitle` is this tab's current and only total order, so holding it
	// ascending keeps the default view byte-identical to what shipped, and flipping Status to
	// descending reverses the status groups without also reversing the alphabet inside each one.
	return result !== 0 ? result : compareFeaturesByTitle(left, right);
}
