/**
 * The one header strip for a data table.
 *
 * The sweep found this exact class list copied verbatim into six tables, which is how one of them
 * drifted: `UnifiedExecutionTable` had already lost `border-border` off its `border-b` while the
 * others kept it. Importing the string is what keeps a token change to a single edit.
 */
export const tableHeadClass =
	'border-b border-border bg-muted text-xs text-muted-foreground uppercase';
