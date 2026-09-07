import type { ProjectFeature } from '../../../api/types.ts';

import { stringValue } from './shared.ts';

/** A parsed instant: the ISO string a `<time>` element needs, and the epoch a comparator needs. */
export interface FeatureInstant {
	iso: string;
	timeValue: number;
}

/**
 * The two lifecycle instants of a feature, derived in one place.
 *
 * The History tab and the Features table both want "when was this added" and "when was this
 * finished", and both had to answer it from a record that carries three timestamp-shaped fields
 * with different meanings. Deriving it twice is how the two surfaces come to disagree, so the rule
 * lives here and `historyTimeline.ts` reads it rather than repeating it.
 */
function parsedTimestamp(value: unknown): FeatureInstant | null {
	if (typeof value !== 'string' || value.length === 0) return null;
	const timeValue = Date.parse(value);
	if (Number.isNaN(timeValue)) return null;
	return { iso: value, timeValue };
}

/** When the feature record was first written. */
export function featureAddedAt(feature: ProjectFeature): FeatureInstant | null {
	return parsedTimestamp(feature.createdAt);
}

/**
 * When the feature entered `completed`.
 *
 * `completedAt` is the real field, stamped by the runtime on the status flip. `updatedAt` is the
 * fallback for records that carry no `completedAt` — it means "last
 * metadata write", so it is only meaningful at all once the feature is finished, and the status
 * guard is what keeps an in-progress feature's last edit from rendering as a completion date.
 *
 * `justFinishedAt` is deliberately not consulted: it exists on 23 template-era records and holds
 * two distinct values between them, which makes it a one-time backfill constant rather than an
 * instant anything happened at.
 */
export function featureCompletedAt(feature: ProjectFeature): FeatureInstant | null {
	if (stringValue(feature, 'status') !== 'completed') return null;
	return parsedTimestamp(feature.completedAt) ?? parsedTimestamp(feature.updatedAt);
}
