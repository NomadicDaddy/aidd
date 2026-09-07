import { hasParkedWorkMarker } from 'aidd-shared/runs/outcome';

/**
 * Counts, per session, the runs that parked their feature instead of completing it.
 *
 * A parking run exits 0 with stopReason 'completed', so every step row is green and the session
 * terminalizes green too — a review of such a session reads as finished work when in fact nothing
 * it selected got done. The marker lives in the run summary (the runs table has no artifacts
 * column), so this is where the session learns about it.
 * @param rows Run rows for the sessions of interest; rows with no session are ignored.
 * @returns Session id to parked-run count, omitting sessions with none.
 */
export function indexParkedWorkRuns(
	rows: readonly { pipelineSessionId: null | string; summary: null | string }[],
): Map<string, number> {
	const bySessionId = new Map<string, number>();
	for (const row of rows) {
		if (row.pipelineSessionId === null || !hasParkedWorkMarker(row.summary)) continue;
		bySessionId.set(row.pipelineSessionId, (bySessionId.get(row.pipelineSessionId) ?? 0) + 1);
	}
	return bySessionId;
}
