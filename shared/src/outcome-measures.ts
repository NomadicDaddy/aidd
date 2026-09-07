import type { FindingDismissalReason } from './contracts/finding-dispositions.ts';
import type { FindingLedgerEvent } from './metadata/findings-ledger.ts';

export const findingLifecycleBuckets = [
	'dismissed',
	'emitted',
	'recurred',
	'remediated',
	'suppressed-dismissed',
	'suppressed-duplicate',
] as const;

export type FindingLifecycleBucket = (typeof findingLifecycleBuckets)[number];

type FindingTerminalBucket = Exclude<
	FindingLifecycleBucket,
	'suppressed-dismissed' | 'suppressed-duplicate'
>;

export interface OutcomeRate {
	denominator: number;
	numerator: number;
	value: null | number;
}

export interface FindingLifecycleMeasures {
	acceptanceRate: OutcomeRate;
	buckets: Record<FindingLifecycleBucket, number>;
	decided: number;
	dismissed: number;
	dismissedByReason: Record<FindingDismissalReason, number>;
	emitted: number;
	falsePositiveRate: OutcomeRate;
	findingCount: number;
	recurred: number;
	recurrenceRate: OutcomeRate;
	remediated: number;
	/** Remediated fingerprints keyed by the run that last emitted or recurred them; '' when unknown. */
	remediatedByEmittingRun: Record<string, number>;
	suppressedDismissed: number;
	suppressedDuplicate: number;
}

export interface FindingOutcomeAggregation {
	byAudit: Map<string, FindingLifecycleMeasures>;
	byFingerprint: Map<string, FindingLifecycleMeasures>;
}

const dismissalReasons: FindingDismissalReason[] = [
	'already-handled',
	'false-positive',
	'not-worth-it',
	'other',
	'wrong-severity',
];

function emptyBucketCounts(): Record<FindingLifecycleBucket, number> {
	return {
		dismissed: 0,
		emitted: 0,
		recurred: 0,
		remediated: 0,
		'suppressed-dismissed': 0,
		'suppressed-duplicate': 0,
	};
}

function emptyDismissalCounts(): Record<FindingDismissalReason, number> {
	return {
		'already-handled': 0,
		'false-positive': 0,
		'not-worth-it': 0,
		other: 0,
		'wrong-severity': 0,
	};
}

function rate(numerator: number, denominator: number): OutcomeRate {
	return { denominator, numerator, value: denominator > 0 ? numerator / denominator : null };
}

/** Ledger order: the event timestamp first, file position as the tie-break. */
interface EventKey {
	at: number;
	index: number;
}

function isLater(a: EventKey, b: EventKey): boolean {
	return a.at > b.at || (a.at === b.at && a.index > b.index);
}

interface FingerprintState {
	bucket: FindingTerminalBucket;
	bucketKey: EventKey | undefined;
	dismissalReason: FindingDismissalReason | undefined;
	emittingKey: EventKey | undefined;
	emittingRunId: string;
	firstRemediatedKey: EventKey | undefined;
	latestRecurredKey: EventKey | undefined;
}

interface MutableMeasures {
	buckets: Record<FindingLifecycleBucket, number>;
	dismissedByReason: Record<FindingDismissalReason, number>;
	recurrenceDenominator: number;
	recurrenceNumerator: number;
	remediatedByEmittingRun: Record<string, number>;
}

function createMutableMeasures(): MutableMeasures {
	return {
		buckets: emptyBucketCounts(),
		dismissedByReason: emptyDismissalCounts(),
		recurrenceDenominator: 0,
		recurrenceNumerator: 0,
		remediatedByEmittingRun: {},
	};
}

function finalize(measures: MutableMeasures): FindingLifecycleMeasures {
	const { buckets } = measures;
	const decided = buckets.remediated + buckets.dismissed;
	const findingCount = findingLifecycleBuckets.reduce(
		(total, bucket) => total + buckets[bucket],
		0,
	);
	return {
		acceptanceRate: rate(buckets.remediated, decided),
		buckets: { ...buckets },
		decided,
		dismissed: buckets.dismissed,
		dismissedByReason: { ...measures.dismissedByReason },
		emitted: buckets.emitted,
		falsePositiveRate: rate(measures.dismissedByReason['false-positive'], decided),
		findingCount,
		recurred: buckets.recurred,
		recurrenceRate: rate(measures.recurrenceNumerator, measures.recurrenceDenominator),
		remediated: buckets.remediated,
		remediatedByEmittingRun: { ...measures.remediatedByEmittingRun },
		suppressedDismissed: buckets['suppressed-dismissed'],
		suppressedDuplicate: buckets['suppressed-duplicate'],
	};
}

function applyEvent(state: FingerprintState, event: FindingLedgerEvent, key: EventKey): void {
	const kind = event.event as FindingTerminalBucket;
	if (kind === 'emitted' || kind === 'recurred') {
		if (!state.emittingKey || isLater(key, state.emittingKey)) {
			state.emittingKey = key;
			state.emittingRunId = event.runId ?? '';
		}
		if (
			kind === 'recurred' &&
			(!state.latestRecurredKey || isLater(key, state.latestRecurredKey))
		) {
			state.latestRecurredKey = key;
		}
	} else if (kind === 'remediated') {
		if (!state.firstRemediatedKey || isLater(state.firstRemediatedKey, key)) {
			state.firstRemediatedKey = key;
		}
	}
	if (!state.bucketKey || !isLater(state.bucketKey, key)) {
		state.bucket = kind;
		state.bucketKey = key;
		state.dismissalReason = kind === 'dismissed' ? event.reason : undefined;
	}
}

/**
 * Aggregates one project's append-only findings ledger.
 *
 * Every fingerprint lands in exactly one lifecycle bucket: the latest of its emitted, recurred,
 * dismissed, or remediated events wins, ordered by timestamp and then by ledger position. The
 * counts and rates derive from those buckets, so a finding dismissed and later remediated is one
 * accepted finding, not one dismissal plus one remediation. Suppressed observations are standalone
 * occurrences (no feature directory exists for them) and never move a fingerprint's bucket.
 * Recurrence counts fingerprints that recurred after their first remediation, over the fingerprints
 * ever remediated, so it stays within 0 and 1.
 */
export function measureFindingLifecycle(
	events: readonly FindingLedgerEvent[],
): FindingLifecycleMeasures {
	const measures = createMutableMeasures();
	const states = new Map<string, FingerprintState>();
	events.forEach((event, index) => {
		if (event.event === 'suppressed-dismissed' || event.event === 'suppressed-duplicate') {
			measures.buckets[event.event] += 1;
			return;
		}
		const parsedAt = Date.parse(event.at);
		const key = { at: Number.isNaN(parsedAt) ? 0 : parsedAt, index };
		let state = states.get(event.fingerprint);
		if (!state) {
			state = {
				bucket: 'emitted',
				bucketKey: undefined,
				dismissalReason: undefined,
				emittingKey: undefined,
				emittingRunId: '',
				firstRemediatedKey: undefined,
				latestRecurredKey: undefined,
			};
			states.set(event.fingerprint, state);
		}
		applyEvent(state, event, key);
	});
	for (const state of states.values()) {
		measures.buckets[state.bucket] += 1;
		if (state.bucket === 'dismissed' && state.dismissalReason !== undefined) {
			measures.dismissedByReason[state.dismissalReason] += 1;
		}
		if (state.bucket === 'remediated') {
			measures.remediatedByEmittingRun[state.emittingRunId] =
				(measures.remediatedByEmittingRun[state.emittingRunId] ?? 0) + 1;
		}
		if (state.firstRemediatedKey) {
			measures.recurrenceDenominator += 1;
			if (
				state.latestRecurredKey &&
				isLater(state.latestRecurredKey, state.firstRemediatedKey)
			) {
				measures.recurrenceNumerator += 1;
			}
		}
	}
	return finalize(measures);
}

export function mergeFindingLifecycleMeasures(
	parts: readonly FindingLifecycleMeasures[],
): FindingLifecycleMeasures {
	const merged = createMutableMeasures();
	for (const part of parts) {
		for (const bucket of findingLifecycleBuckets)
			merged.buckets[bucket] += part.buckets[bucket];
		for (const reason of dismissalReasons) {
			merged.dismissedByReason[reason] += part.dismissedByReason[reason];
		}
		merged.recurrenceNumerator += part.recurrenceRate.numerator;
		merged.recurrenceDenominator += part.recurrenceRate.denominator;
		for (const [runId, count] of Object.entries(part.remediatedByEmittingRun)) {
			merged.remediatedByEmittingRun[runId] =
				(merged.remediatedByEmittingRun[runId] ?? 0) + count;
		}
	}
	return finalize(merged);
}

function pushGrouped(
	groups: Map<string, FindingLedgerEvent[]>,
	key: string,
	event: FindingLedgerEvent,
): void {
	const existing = groups.get(key);
	if (existing) existing.push(event);
	else groups.set(key, [event]);
}

export function aggregateFindingOutcomes(
	events: readonly FindingLedgerEvent[],
): FindingOutcomeAggregation {
	const auditEvents = new Map<string, FindingLedgerEvent[]>();
	const fingerprintEvents = new Map<string, FindingLedgerEvent[]>();
	for (const event of events) {
		pushGrouped(auditEvents, event.auditSource.trim().toUpperCase(), event);
		pushGrouped(fingerprintEvents, event.fingerprint, event);
	}
	const byAudit = new Map<string, FindingLifecycleMeasures>();
	for (const [audit, grouped] of auditEvents)
		byAudit.set(audit, measureFindingLifecycle(grouped));
	const byFingerprint = new Map<string, FindingLifecycleMeasures>();
	for (const [fingerprint, grouped] of fingerprintEvents) {
		byFingerprint.set(fingerprint, measureFindingLifecycle(grouped));
	}
	return { byAudit, byFingerprint };
}
