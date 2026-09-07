import type { TelemetryProjectCostRow } from '../../api/types.ts';

import { formatUsd } from '../../lib/formatters.ts';

type CostFacts = Pick<TelemetryProjectCostRow, 'costedInvocationCount' | 'costUsd'>;
type CoverageFacts = Pick<TelemetryProjectCostRow, 'costedInvocationCount' | 'invocationCount'>;

/**
 * What a project's window cost, or why there is no figure.
 *
 * A project whose runs never reported dollars is unknown, not free: `$0.00` would claim the
 * backends priced the work at nothing. Real spend below a cent gets its own reading for the same
 * reason - rounding money that was actually charged down to `$0.00` is the same claim in reverse.
 */
export function formatProjectCost(row: CostFacts): string {
	if (row.costedInvocationCount === 0) return 'Unknown';
	if (row.costUsd > 0 && row.costUsd < 0.005) return '<$0.01';
	return formatUsd(row.costUsd);
}

/** How much of the project's window carried a price, so partial coverage reads as partial. */
export function projectCostCoverage(row: CoverageFacts): string {
	if (row.costedInvocationCount === 0) return 'no reported cost';
	if (row.costedInvocationCount >= row.invocationCount) return 'all priced';
	return `${row.costedInvocationCount} of ${row.invocationCount} priced`;
}

/** The window's total reported spend, over the projects that reported any. */
export function totalProjectCost(rows: CostFacts[]): string {
	return formatProjectCost({
		costedInvocationCount: rows.reduce((sum, row) => sum + row.costedInvocationCount, 0),
		costUsd: rows.reduce((sum, row) => sum + row.costUsd, 0),
	});
}
