import type { Feature, FeatureValidationIssue } from './types.ts';

// Allows for ordinary clock skew between processes. A later stamp is an agent typing a time rather
// than reading the clock, and it misorders every age and recency reading that trusts the field.
const FUTURE_TIMESTAMP_SKEW_MS = 10 * 60 * 1000;

export function futureTimestampIssues(
	feature: Feature,
	id: string,
	validatedAtMs: number,
): FeatureValidationIssue[] {
	const issues: FeatureValidationIssue[] = [];
	for (const field of ['completedAt', 'createdAt', 'updatedAt'] as const) {
		const value = feature[field];
		if (typeof value !== 'string') continue;
		// An unparseable stamp is not reported yet: 36 template-owned records carry one today, and
		// their apps cannot edit them (see the timestamps-not-in-the-future record).
		if (Date.parse(value) > validatedAtMs + FUTURE_TIMESTAMP_SKEW_MS) {
			issues.push({ id, message: `${field} '${value}' is in the future` });
		}
	}
	return issues;
}
