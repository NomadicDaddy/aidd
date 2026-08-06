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

// Catalog anchors. They live here rather than beside their components because a file that
// exports a component may not export anything else (react-refresh/only-export-components).
export const auditLaunchTargetsId = 'audit-launch-targets';
export const auditDefinitionEditorId = 'audit-definition-editor';

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

// Applicability is a configuration matrix, not a health readout: every cell here is somebody's
// deliberate policy and none of them is a fault. `excluded` in particular is the ordinary answer for
// the Archive bucket, and painting it red made a correctly-configured column look like a wall of
// failures. All four effects are neutral and the cell text carries the distinction; the matrix
// reserves emphasis for the one thing that is genuinely wrong, which is nothing on this screen.
export const effectTone: Record<AuditEffect, 'neutral'> = {
	default: 'neutral',
	disabled: 'neutral',
	excluded: 'neutral',
	required: 'neutral',
};

export const overrideEffects: { label: string; value: 'default' | AuditOverrideEffect }[] = [
	{ label: 'Default', value: 'default' },
	{ label: 'Required', value: 'required' },
	{ label: 'Disabled', value: 'disabled' },
	{ label: 'Excluded', value: 'excluded' },
];

// Column headers carry the units so the rows do not have to. Every catalog row used to restate
// "applicable", "buckets" and "fresh / stale / missing" — 168 repeated words in a table whose data
// is five numbers per row, and the repetition is what stopped the numbers forming columns.
export const reportsColumnLabel = 'Reports (fresh / stale / missing)';
export const bucketsColumnLabel = `Buckets (of ${bucketColumns.length})`;

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

// Every audit definition lives in the same directory, so repeating the prefix on all ~40 rows
// spends the catalog's narrowest column on the one part of the path that never varies. The row shows
// the file name; the full path stays in the cell's `title` and in the definition editor's header.
export function auditFileName(path: string): string {
	const segments = path.split(/[/\\]/);
	return segments[segments.length - 1] || path;
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
