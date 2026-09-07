import type { ResourceUsageRow } from '../../api/types.ts';

/** The window's invocation counts, one field per outcome bucket the summary tiles report. */
export interface TelemetryTotals {
	completed: number;
	failed: number;
	flagged: number;
	killed: number;
	nested: number;
	noWork: number;
	running: number;
	stopped: number;
	topLevel: number;
	total: number;
	warnings: number;
}

function emptyTelemetryTotals(): TelemetryTotals {
	return {
		completed: 0,
		failed: 0,
		flagged: 0,
		killed: 0,
		nested: 0,
		noWork: 0,
		running: 0,
		stopped: 0,
		topLevel: 0,
		total: 0,
		warnings: 0,
	};
}

/**
 * The per-resource usage rows folded into the page's totals.
 *
 * This is the filtered invocation count the toolbar prints and the summary tiles break down, so it
 * is also the figure the per-project rollup has to reconcile with: both read the same filtered
 * invocation_events set, one grouped by resource and one grouped by project.
 */
export function sumTelemetryTotals(rows: ResourceUsageRow[]): TelemetryTotals {
	const totals = emptyTelemetryTotals();
	for (const row of rows) {
		totals.completed += row.completed;
		totals.failed += row.failed;
		totals.flagged += row.flagged;
		totals.killed += row.killed;
		totals.nested += row.nested;
		totals.noWork += row.noWork;
		totals.running += row.running;
		totals.stopped += row.stopped;
		totals.topLevel += row.topLevel;
		totals.total += row.total;
		totals.warnings += row.warnings;
	}
	return totals;
}
