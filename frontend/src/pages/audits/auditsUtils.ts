import type {
	AuditApplicabilityCell,
	AuditAssuranceBucket,
	AuditChangePotential,
	AuditChangePotentialBand,
	AuditEffect,
	AuditOverrideEffect,
} from '../../api/types.ts';

export type HealthFilter = 'all' | 'fresh' | 'missing' | 'stale';
export type AuditsTab = 'applicability' | 'catalog' | 'overrides';

export const bucketColumns: AuditAssuranceBucket[] = [
	'prototype_archive',
	'single_user_local',
	'multi_user_local',
	'private_team',
	'internet_single_org',
	'public_multi_tenant',
	'critical_regulated',
];

export const bucketShortLabels: Record<AuditAssuranceBucket, string> = {
	critical_regulated: 'Critical',
	internet_single_org: 'Org',
	multi_user_local: 'Multi',
	private_team: 'Team',
	prototype_archive: 'Archive',
	public_multi_tenant: 'Public',
	single_user_local: 'Single',
};

export const effectTone: Record<AuditEffect, 'cyan' | 'emerald' | 'neutral' | 'red'> = {
	default: 'emerald',
	disabled: 'neutral',
	excluded: 'red',
	required: 'cyan',
};

export const overrideEffects: { label: string; value: 'default' | AuditOverrideEffect }[] = [
	{ label: 'Default', value: 'default' },
	{ label: 'Required', value: 'required' },
	{ label: 'Disabled', value: 'disabled' },
	{ label: 'Excluded', value: 'excluded' },
];

export const bandTone: Record<AuditChangePotentialBand, 'amber' | 'emerald' | 'neutral'> = {
	High: 'emerald',
	Low: 'neutral',
	Medium: 'amber',
};

export function describeChangePotential(potential: AuditChangePotential): string {
	const ev = potential.evidence;
	const lines = [
		`Score ${potential.score} (${potential.band})`,
		`Confidence ${potential.confidence}`,
		`Priority ${ev.priority ?? 'unset'}${ev.actionable ? ' • actionable' : ''}`,
		`Active findings ${ev.activeAuditFeatures} • Completed runs ${ev.completedRunsWithFindings}`,
		`Apps w/ completed evidence ${ev.appsWithCompletedFeatureEvidence}` +
			` • Apps w/ reports ${ev.appsWithAuditReports}`,
	];
	return lines.join(' • ');
}

export function healthFor(definition: {
	missingReportCount: number;
	staleReportCount: number;
}): HealthFilter {
	if (definition.missingReportCount > 0) return 'missing';
	if (definition.staleReportCount > 0) return 'stale';
	return 'fresh';
}

export function describeCell(cell: AuditApplicabilityCell): string {
	const ruleSuffix = cell.ruleId ? ` (rule ${cell.ruleId})` : '';
	const conditionalSuffix = cell.conditional
		? ' — depends on non-bucket facets in the rule match'
		: '';
	return `${cell.effect} • ${cell.source}${ruleSuffix}${conditionalSuffix}`;
}
