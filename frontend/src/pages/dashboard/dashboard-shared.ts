import type { Tone } from '../../lib/tones.ts';

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
