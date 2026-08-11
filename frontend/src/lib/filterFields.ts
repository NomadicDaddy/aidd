/**
 * The order filter fields appear in, everywhere.
 *
 * Six toolbars each chose their own, and two of them belonged to tabs of the same page: Features
 * read Search · Status · Milestone · Source and the Dependencies tab beside it read Search · Status
 * · Source · Milestone, so switching tabs moved a control the operator had just used. The sequence
 * is search, then what state the thing is in, then how healthy it is, then what it belongs to. A
 * toolbar renders any subsequence of this; it never reorders it.
 *
 * `test/frontend/filter-toolbar-pattern.test.ts` reads the labels out of each toolbar and checks
 * they are a subsequence, which is the only way this stays true of the seventh toolbar.
 */
export const FILTER_FIELD_ORDER = [
	'Search',
	'Status',
	'State',
	'Unsaved',
	// What kind of thing the row is. It sits ahead of Mode because Mode narrows within a kind — it
	// is a run-only concept, so choosing one already hides every pipeline and skill session — and
	// behind Status because status is the one axis every kind shares.
	'Kind',
	'Mode',
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
