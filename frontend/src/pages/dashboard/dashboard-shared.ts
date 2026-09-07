import type { Tone } from '../../lib/tones.ts';

export const DASHBOARD_CARD_MAX_ROWS = 6;

export function getHealthTone(value: number): 'amber' | 'emerald' | 'red' {
	if (value >= 90) return 'emerald';
	if (value >= 70) return 'amber';
	return 'red';
}

const HEALTH_BAND_LABELS: Record<string, string> = {
	artifact_unhealthy: 'Artifacts need refresh',
	audit_backlog: 'Audit findings pending',
	audit_stale: 'Audits are stale',
	feature_backlog: 'Feature backlog pending',
	healthy: 'Healthy',
	remediation_backlog: 'Remediations pending',
};

export function healthBandLabel(value: string): string {
	return HEALTH_BAND_LABELS[value] ?? value.replaceAll('_', ' ');
}

// One reading of feature priority for the whole dashboard. The Feature Queue rendered a toned
// Badge, the Feature Status table rendered untoned body text and used a different null label, so
// the same concept changed shape between two cards on one page.
export function priorityTone(priority: null | number | string): Tone {
	if (priority === null || priority === '') return 'neutral';
	const numeric = typeof priority === 'number' ? priority : Number(priority);
	if (Number.isNaN(numeric)) return 'neutral';
	if (numeric <= 1) return 'red';
	if (numeric <= 2) return 'amber';
	if (numeric <= 3) return 'teal';
	return 'neutral';
}

export function priorityLabel(priority: null | number | string): string {
	if (priority === null || priority === '') return 'P—';
	return `P${priority}`;
}

export interface DashboardCardPlacement {
	column: '1 / -1' | 1 | 2;
	rowSpan: number;
	rowStart: number;
}

const DASHBOARD_CARD_GAP = 16;

// `suggestionRiskTone`/`suggestionRiskLabel` lived here while the dashboard was the only place that
// read risk out of a suggestion. It was not: the Director queue prints the same field off the same
// records, from its own copy of the mapping, and the two had already drifted on `LOW`. Both now read
// `riskTone`/`riskLabel` from lib/directorConstants.ts.

/**
 * Index of the card left alone on the final grid row, or `null` when the last row is full.
 *
 * At `xl` the dashboard grid is two columns; a full-width card takes a row to itself and resets the
 * column. If the walk ends mid-row the last card opened a row with nothing beside it, and since the
 * order puts the tallest cards last that dead column was measured at 1696px of empty background —
 * the page ran to y=3819 with nothing rendered at x=928..1576 below y=2123. Computed from the walk
 * rather than from `length % 2` because cards are reorderable and any of them can be set full.
 */
export function orphanedLastCardIndex(fullWidths: readonly boolean[]): null | number {
	let column = 0;
	for (const full of fullWidths) {
		if (full) column = 0;
		else column = column === 0 ? 1 : 0;
	}
	// Ending at column 1 means the final card opened a row and nothing followed it.
	return column === 1 ? fullWidths.length - 1 : null;
}

/**
 * Place half-width cards into two independently advancing columns. Full-width cards wait for both
 * columns and then reset the pair, preserving the deliberate break in the saved card order.
 *
 * CSS grid rows are one pixel high with no row gap. Advancing a column by the measured card height
 * plus the normal 16px card gap keeps the vertical rhythm exact without coupling either column's
 * height to the card beside it.
 */
export function dashboardCardPlacements(
	fullWidths: readonly boolean[],
	heights: readonly number[],
): DashboardCardPlacement[] {
	const orphanIndex = orphanedLastCardIndex(fullWidths);
	const columnEnds = [0, 0];

	return fullWidths.map((fullWidth, index) => {
		const height = Math.max(Math.ceil(heights[index] ?? 0), 1);
		const spansBothColumns = fullWidth || index === orphanIndex;

		if (spansBothColumns) {
			const start = Math.max(columnEnds[0] ?? 0, columnEnds[1] ?? 0);
			const end = start + height + DASHBOARD_CARD_GAP;
			columnEnds[0] = end;
			columnEnds[1] = end;
			return { column: '1 / -1', rowSpan: height, rowStart: start + 1 };
		}

		// Preserve the saved/DOM order while always advancing the shorter column. Strict
		// alternation let one tall card strand an empty region beside it for the rest of the page.
		const column = (columnEnds[0] ?? 0) <= (columnEnds[1] ?? 0) ? 0 : 1;
		const start = columnEnds[column] ?? 0;
		columnEnds[column] = start + height + DASHBOARD_CARD_GAP;
		return { column: column === 0 ? 1 : 2, rowSpan: height, rowStart: start + 1 };
	});
}
