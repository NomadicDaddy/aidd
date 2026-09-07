/**
 * The order filter fields appear in, everywhere.
 *
 * Six toolbars each chose their own, and two of them belonged to tabs of the same page: Features
 * read Search · Status · Milestone · Source and the Dependencies tab beside it read Search · Status
 * · Source · Milestone, so switching tabs moved a control the operator had just used. The sequence
 * is search, then what state and priority the thing has, then how healthy it is, then what it
 * belongs to. A toolbar renders any subsequence of this; it never reorders it.
 *
 * `test/frontend/filter-toolbar-pattern.test.ts` reads the labels out of each toolbar and checks
 * they are a subsequence, which is the only way this stays true of the seventh toolbar.
 */
export const FILTER_FIELD_ORDER = [
	'Search',
	// Presentation order changes how the current result set is arranged; it belongs immediately
	// after Search and before filters that change membership.
	'Order',
	'Status',
	'Priority',
	'State',
	'Unsaved',
	// What kind of thing the row is. It sits ahead of Mode because Mode narrows within a kind — it
	// is a run-only concept, so choosing one already hides every pipeline and skill session — and
	// behind Status because status is the one axis every kind shares.
	'Kind',
	'Category',
	'Mode',
	// Who caused the run, beside what the run does. Run-only in the same way Mode is, so it sits
	// with it rather than out among the axes every kind shares.
	'Initiator',
	'Health',
	'Posture',
	'Sync',
	'Phase',
	'Maturity',
	'Root',
	'Project',
	'Milestone',
	'Source',
] as const;

/** Count page-owned filters without moving their state into the shared presentation component. */
export function countActiveFilters(...filters: boolean[]): number {
	return filters.filter(Boolean).length;
}

/** One filter the operator has set, labelled exactly as its control is labelled. */
export type ActiveFilter = { label: string; value: string };

/** What an `EmptyState` needs to say a result set was narrowed, and to hand back the way out. */
export type FilterRegister = { inForce: ActiveFilter[]; onReset: () => void };

/**
 * The filtered-to-nothing register for an `EmptyState`, or `undefined` when nothing is in force.
 *
 * Entries are written `condition && { label, value }` so each filter's test sits beside the filter
 * it describes and falsy entries drop out. Returning `undefined` rather than an empty register is
 * what keeps the two empty registers apart at the call site: a surface with no filters set is
 * asserting absence, and it must not offer a reset for filters nobody applied.
 */
export function filterRegister(
	onReset: () => void,
	entries: (ActiveFilter | false | null | undefined)[],
): FilterRegister | undefined {
	const inForce = entries.filter((entry): entry is ActiveFilter => Boolean(entry));
	return inForce.length === 0 ? undefined : { inForce, onReset };
}
