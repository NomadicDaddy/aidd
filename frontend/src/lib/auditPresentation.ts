import type { ProfilePreviewAudit } from '../api/projectProfiles.ts';
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

// The line under an audit's name in the profile preview: why it is off, or what detection saw of
// the surface it measures. Amber is for one case only, an audit that applies because detection
// could not finish, and the flag decides it, never the wording of the evidence. An audit a lead
// required over an absent surface is a decision already carried by its `required` chip, so its line
// stays muted and only records what detection saw.
export function auditApplicabilityNote(
	audit: ProfilePreviewAudit,
): { text: string; tone: 'amber' | 'muted' } | null {
	if (!audit.applies) {
		return audit.reason === undefined ? null : { text: audit.reason, tone: 'muted' };
	}
	const surface = audit.surface;
	if (surface === undefined) return null;
	const label = surface.name.replaceAll('-', ' ');
	const evidence = surface.evidence === undefined ? '' : `: ${surface.evidence}`;
	if (surface.undecided) {
		return { text: `Applies because detection could not finish${evidence}`, tone: 'amber' };
	}
	if (surface.present) return { text: `${label} found${evidence}`, tone: 'muted' };
	return { text: `Required by override; no ${label} detected`, tone: 'muted' };
}

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
