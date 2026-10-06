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
export function milestoneBadgeTone(ms: ProjectMilestoneSummary): BadgeTone {
	return ms.total > 0 && ms.completed === ms.total ? 'emerald' : 'neutral';
}
