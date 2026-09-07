import type { Feature } from '../features.ts';
import type { FindingLedgerEvent, FindingLedgerEventInput } from '../findings-ledger.ts';

/**
 * The `remediated` event a feature write should record, or undefined when it should record
 * nothing. Emitted at most once per (fingerprint, featureId): a finding that is reopened and
 * completed again was already counted as remediated, so the ledger (not the previous record's
 * status) is what decides whether this completion is the first.
 */
/** Whether this write is a completion transition of a fingerprinted finding at all; lets the
 * store skip the ledger read for the overwhelming majority of feature writes. */
export function remediationCandidate(previous: Feature | undefined, next: Feature): boolean {
	return (
		previous !== undefined &&
		typeof next.fingerprint === 'string' &&
		typeof next.auditSource === 'string' &&
		next.auditSource.length > 0 &&
		next.status === 'completed' &&
		next.passes === true &&
		!(previous.status === 'completed' && previous.passes === true)
	);
}

export function remediatedFindingEvent(
	previous: Feature | undefined,
	next: Feature,
	featureId: string,
	ledgerEvents: readonly FindingLedgerEvent[] = [],
): FindingLedgerEventInput | undefined {
	if (!remediationCandidate(previous, next)) return undefined;
	const fingerprint = next.fingerprint as string;
	const alreadyRemediated = ledgerEvents.some(
		(event) =>
			event.event === 'remediated' &&
			event.fingerprint === fingerprint &&
			event.featureId === featureId,
	);
	if (alreadyRemediated) return undefined;
	return {
		auditSource: next.auditSource as string,
		event: 'remediated',
		featureId,
		fingerprint,
		source: 'feature-completion',
	};
}
