import type { ProjectDetail } from '../../../api/types.ts';

import { humanizeEnum } from '../../../lib/formatters.ts';

export const FEATURES_PAGE_SIZE = 15;
export const RECENT_ACTIVITY_LIMIT = 5;

export type ArtifactHealth = ProjectDetail['artifactHealth'];

export function stringValue(record: Record<string, unknown>, key: string): string {
	const value = record[key];
	return typeof value === 'string' ? value : '';
}

/**
 * A source category on its own, humanized but unprefixed.
 *
 * An acronym stays as authored — `HYGIENE`, not `Hygiene` — which is the same rule
 * `featureSourceDisplayLabel` applies after stripping its prefix, kept in one place so the two
 * cannot drift.
 */
export function featureSourceCategoryLabel(category: string): string {
	return /^[A-Z0-9]+$/.test(category) ? category : humanizeEnum(category);
}

export function featureSourceDisplayLabel(label: string): string {
	for (const prefix of ['Audit: ', 'Feature: ']) {
		if (label.startsWith(prefix)) {
			return `${prefix}${featureSourceCategoryLabel(label.slice(prefix.length))}`;
		}
	}
	return label;
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
