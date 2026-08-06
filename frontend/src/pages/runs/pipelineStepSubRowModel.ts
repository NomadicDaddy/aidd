import { usePipelineSessionReport } from '../../hooks/usePipelineSessions.ts';
import { buildStepRows, type StepRow } from '../pipelineSessions/StepRows.tsx';

/**
 * The step list behind an expanded pipeline row, and the one-line notice that stands in for it.
 *
 * Shared because the desktop table and the mobile card list render the same steps into two
 * different boxes — `<tr>` elements against the parent table's columns, and a list of cards — and
 * the fetch, the fallback ordering and the three empty states must not be decided twice.
 *
 * Per-session report; polls every 3s while the session is active (the same load profile as having
 * its report page open). Instantiated only while the session is expanded.
 */
export function usePipelineStepSubRows(sessionId: string): {
	notice: null | string;
	rows: StepRow[];
} {
	const report = usePipelineSessionReport(sessionId);
	if (report.isLoading) return { notice: 'Loading steps…', rows: [] };
	if (!report.data) return { notice: 'Step details are unavailable.', rows: [] };
	const rows = buildStepRows(report.data);
	if (rows.length === 0) return { notice: 'No steps recorded yet.', rows: [] };
	return { notice: null, rows };
}

/** The NAME cell's indent for a step at `depth`, capped so a deep nest still leaves room to read. */
export function stepIndentPx(depth: number): number {
	return 16 + Math.min(depth, 4) * 16;
}
