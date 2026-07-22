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
