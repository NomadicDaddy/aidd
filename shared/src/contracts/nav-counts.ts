/**
 * The counts the web shell's sidebar pins to its destination rows.
 *
 * Each number is the size of the list its page shows on arrival, not the raw inventory behind it:
 * `scheduled` counts active tasks because that is the Scheduled page's default filter, while the
 * three catalogs open unfiltered and count everything.
 */
export interface NavCounts {
	audits: number;
	recipes: number;
	scheduled: number;
	skills: number;
}
