import type {
	AuditChangePotential,
	AuditChangePotentialBand,
	AuditEffect,
	AuditOverrideEffect,
} from '../api/types.ts';

// Audit presentation shared by the Audits page and the project detail's audit surfaces.

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

/** Health-tone mapping retained for project-local audit summaries, where the band is a signal. */
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
