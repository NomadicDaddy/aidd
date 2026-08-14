/**
 * The one header strip for a data table.
 *
 * The sweep found this exact class list copied verbatim into six tables, which is how one of them
 * drifted: `UnifiedExecutionTable` had already lost `border-border` off its `border-b` while the
 * others kept it. Importing the string is what keeps a token change to a single edit.
 */
export const tableHeadClass =
	'border-b border-border bg-muted text-xs text-muted-foreground uppercase';

/**
 * Where a data table composition stops widening.
 *
 * The tables in this app declare a `min-w-*` floor — the width below which their columns stop being
 * readable — and nothing above it, so on a 2250px screen they tracked the shell to 1938px and spent
 * every extra pixel on the tracks that needed it least: an integer score column 260px wide, a
 * two-word status column 300px wide, and the one column carrying a name still truncating.
 *
 * The floor answers "how narrow before this breaks"; this answers "how wide before it stops
 * helping", and they are different questions. Measured again on the project Runs tab at 2250x1309:
 * the execution-target chip ended at x=430 and the RUNS figure belonging to the same row sat at
 * x=1400, roughly 950px of empty row, nineteen rows deep. 80rem is 1280px, so nothing at or below
 * 1440 changes and only the viewports that were stretching stop. It is the same step the shared
 * `FilterToolbar` settled on, so a page's table and the toolbar above it stop at one edge and the
 * surplus goes back to the page rather than into two differently-stretched components. The form
 * grids sit a step wider at `formGridMeasureClass` (90rem), because a three-column grid of labelled
 * controls needs the extra column width that a table's own `min-w-*` floor already guarantees.
 *
 * Apply it to the outer Card or composition when that element draws header bands, row rules, or a
 * border around the table. A table inside an intentionally full-width composition may take the cap
 * directly; `OverflowScroller` still owns overflow behaviour and edge fades.
 */
export const tableMeasureClass = 'max-w-[80rem]';

/**
 * The seam a pinned column casts over the cells scrolling beside it.
 *
 * Both edges are one value, mirrored. The Profile Matrix's right-hand Actions column drew
 * `inset -8px`, which puts the shadow on its *outer* edge against the page — so in edit mode the
 * facet selects passed under the left-pinned Project column and were sliced through the middle with
 * no boundary at all, while the one shadow on the table sat where nothing scrolled past. A positive
 * x-offset lays an inset shadow along the left inner edge and a negative one along the right, so a
 * left-pinned column takes the negative and a right-pinned column the positive.
 */
export const pinnedLeftEdgeClass = 'shadow-[inset_-8px_0_8px_-8px_rgba(0,0,0,0.35)]';
export const pinnedRightEdgeClass = 'shadow-[inset_8px_0_8px_-8px_rgba(0,0,0,0.35)]';
