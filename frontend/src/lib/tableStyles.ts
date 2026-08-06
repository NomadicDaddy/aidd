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
