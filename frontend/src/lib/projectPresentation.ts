import type {
	ProjectAssuranceBucket,
	ProjectMilestoneSummary,
	ProjectSummary,
} from '../api/types.ts';

// Project presentation shared across page domains: the projects list and detail own most of their
// labels and tones, but the audits, dashboard and diary pages read these few, so they live here
// rather than in a page directory.

export type BadgeTone = 'amber' | 'emerald' | 'neutral' | 'red' | 'teal';

export const bucketLabels: Record<ProjectAssuranceBucket, string> = {
	critical_regulated: 'Critical',
	internet_single_org: 'Internet org',
	multi_user_local: 'Multi-user local',
	private_team: 'Private team',
	prototype_archive: 'Archive',
	public_multi_tenant: 'Multi-tenant',
	single_user_local: 'Single-user local',
};

export const artifactTone: Record<ProjectSummary['artifactHealth'], BadgeTone> = {
	fresh: 'emerald',
	missing: 'red',
	stale: 'amber',
	unknown: 'neutral',
};

/**
 * Only a finished milestone gets a colour; progress is already carried by the `3/5` each chip
 * prints, and hue between neighbours is not legible at 11px.
 */
// What a compact milestone chip prints after the name. Deferred members are out of the fraction, so
// the chip names them: without it a milestone whose whole scope is set aside reads `0/0`.
export function milestoneChipProgress(ms: ProjectMilestoneSummary): {
	deferred: null | string;
	fraction: null | string;
} {
	if (ms.deferred === 0) return { deferred: null, fraction: `${ms.completed}/${ms.total}` };
	if (ms.total === 0) return { deferred: `${ms.deferred} deferred`, fraction: null };
	return { deferred: `+${ms.deferred} deferred`, fraction: `${ms.completed}/${ms.total}` };
}

// The same fact for a roadmap row, which has room for plain words: `3/5 · 2 deferred`, and the
// deferred count alone when nothing is left in scope. `spoken` is the row's accessible wording.
export function milestoneRowProgress(ms: ProjectMilestoneSummary): {
	spoken: string;
	text: string;
} {
	const fraction = `${ms.completed}/${ms.total}`;
	const deferred = `${ms.deferred} deferred`;
	if (ms.deferred === 0) return { spoken: `${fraction} complete`, text: fraction };
	if (ms.total === 0) return { spoken: deferred, text: deferred };
	return { spoken: `${fraction} complete, ${deferred}`, text: `${fraction} · ${deferred}` };
}

export function milestoneBadgeTone(ms: ProjectMilestoneSummary): BadgeTone {
	return ms.total > 0 && ms.completed === ms.total ? 'emerald' : 'neutral';
}
