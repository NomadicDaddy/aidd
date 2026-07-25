import type { ProjectDetail } from '../../../api/types.ts';

export const FEATURES_PAGE_SIZE = 15;
export const RECENT_ACTIVITY_LIMIT = 5;

export type ArtifactHealth = ProjectDetail['artifactHealth'];

export const artifactTone: Record<ArtifactHealth, 'amber' | 'emerald' | 'neutral' | 'red'> = {
	fresh: 'emerald',
	missing: 'red',
	stale: 'amber',
	unknown: 'neutral',
};

export function stringValue(record: Record<string, unknown>, key: string): string {
	const value = record[key];
	return typeof value === 'string' ? value : '';
}

// Only the canonical feature statuses (FEATURE_STATUSES in
// aidd-shared/metadata/features/validation.ts) get a tone of their own. 'unknown' is the
// UI placeholder for a missing status field (semantically backlog) and stays neutral.
// Anything else — 'done', 'verified', hyphenated variants — is invalid metadata and
// renders red so bad data is self-evident instead of looking like a styling bug.
export function statusTone(status: string): 'amber' | 'emerald' | 'neutral' | 'red' | 'teal' {
	const normalized = status.toLowerCase();
	if (normalized === 'completed') return 'emerald';
	if (normalized === 'in_progress') return 'teal';
	if (normalized === 'waiting_approval') return 'amber';
	if (normalized === 'backlog' || normalized === 'unknown') return 'neutral';
	return 'red';
}

export function runStatusTone(status: string): 'amber' | 'emerald' | 'neutral' | 'red' | 'teal' {
	if (status === 'completed' || status === 'success') return 'emerald';
	if (status === 'running') return 'teal';
	if (status === 'blocked' || status === 'error' || status === 'failed' || status === 'killed') {
		return 'red';
	}
	if (status === 'stopped' || status === 'stop_requested') return 'amber';
	return 'neutral';
}
