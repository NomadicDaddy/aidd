/**
 * Prefixes the report of an audit that could not be performed. The report is kept so the reason
 * is on disk, but it is not audit evidence: every freshness reader excludes it, so the audit
 * stays stale until a run actually performs it.
 *
 * It lives beside the freshness readers, and not with the audit modes that write it, because the
 * readers have to recognise a could-not-run report and must not import the modes to do so.
 */
export const unavailableMarker = '<!-- aidd:audit-unavailable -->';

// The status line the methodology prescribes for an audit with no working instrument:
// `**Status:** SKIPPED / data-unavailable`, in either bold-label shape, quoted or bulleted, with
// the value optionally in backticks. Only a line labelled exactly "Status" declares the report
// skipped; the same phrase against one sub-metric of a measured report does not.
const skippedStatusLinePattern = new RegExp(
	String.raw`^[ \t]*(?:>[ \t]*)*(?:(?:#{1,6}|[-*+])[ \t]+)?(?:\*\*|__)?Status[ \t]*(?:\*\*|__)?[ \t]*:[ \t]*(?:\*\*|__)?[ \t]*\`?SKIPPED[ \t]*\/[ \t]*data-unavailable\b`,
	'im',
);

export function declaresSkippedStatus(reportMarkdown: string): boolean {
	return skippedStatusLinePattern.test(reportMarkdown);
}
