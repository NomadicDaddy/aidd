export const findingDismissalReasons = [
	'already-handled',
	'false-positive',
	'not-worth-it',
	'wrong-severity',
	'other',
] as const;

export type FindingDismissalReason = (typeof findingDismissalReasons)[number];

export function isFindingDismissalReason(value: unknown): value is FindingDismissalReason {
	return (
		typeof value === 'string' && (findingDismissalReasons as readonly string[]).includes(value)
	);
}

/** Feature statuses whose record may be removed (deleted or dismissed) from the backlog. */
export const featureRemovableStatuses = ['backlog', 'waiting_approval'] as const;

export function isRemovableFeatureStatus(status: unknown): boolean {
	return (
		typeof status === 'string' &&
		(featureRemovableStatuses as readonly string[]).includes(status)
	);
}

/**
 * The one predicate every disposition route shares. A finding is dismissable (and therefore
 * must not be bare-deleted) exactly when it carries a fingerprint and a non-empty auditSource:
 * both are needed to write a valid ledger event. A record with a fingerprint but no auditSource
 * is treated as an ordinary feature (removable, not dismissable) so no record can be refused by
 * both routes.
 */
export function isDismissableFinding(feature: {
	auditSource?: unknown;
	fingerprint?: unknown;
}): feature is { auditSource: string; fingerprint: string } {
	return (
		typeof feature.fingerprint === 'string' &&
		feature.fingerprint.length > 0 &&
		typeof feature.auditSource === 'string' &&
		feature.auditSource.length > 0
	);
}
