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
