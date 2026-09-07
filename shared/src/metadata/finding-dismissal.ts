import type { FindingDismissalReason } from '../contracts/finding-dispositions.ts';
import type { Feature } from './features.ts';
import type { FindingLedgerEventInput } from './findings-ledger.ts';
import type { AiddStore } from './store.ts';

import {
	isDismissableFinding,
	isRemovableFeatureStatus,
} from '../contracts/finding-dispositions.ts';
import { removeFeatureRecord } from './store/feature-removal.ts';

export type FindingDismissalRefusalKind = 'not-a-finding' | 'status';

/** Thrown before anything is written when the record cannot be dismissed. */
export class FindingDismissalRefusedError extends Error {
	readonly kind: FindingDismissalRefusalKind;

	constructor(kind: FindingDismissalRefusalKind, message: string) {
		super(message);
		this.name = 'FindingDismissalRefusedError';
		this.kind = kind;
	}
}

export interface FindingDismissalRequest {
	note?: string;
	reason: FindingDismissalReason;
	/** Who recorded the dismissal: `web-ui`, `cli`, or a skill id. */
	source: string;
}

export interface FindingDismissalOutcome {
	event: FindingLedgerEventInput;
	/** Set when the ledger event was written but the directory could not be removed. The event
	 * is durable; a retry with the same feature is a no-op append followed by another removal. */
	removalError?: unknown;
}

/** The status guard shared by delete and dismissal: only unstarted work may be removed. */
export function assertFeatureRemovable(feature: Feature): void {
	if (!isRemovableFeatureStatus(feature.status)) {
		throw new FindingDismissalRefusedError(
			'status',
			'Only backlog or waiting_approval features can be deleted',
		);
	}
}

export function assertFindingDismissable(feature: Feature): asserts feature is {
	auditSource: string;
	fingerprint: string;
} & Feature {
	if (!isDismissableFinding(feature)) {
		throw new FindingDismissalRefusedError(
			'not-a-finding',
			'Only fingerprinted audit findings with an auditSource can be dismissed',
		);
	}
}

/**
 * Dismiss a finding: write the `dismissed` event first (so the decision survives even if the
 * removal fails), then remove the feature directory and its roadmap entry. The store stamps
 * `at`; callers never assemble ledger lines by hand.
 */
export async function dismissFinding(
	store: {
		metadataDir: string;
	} & Pick<AiddStore, 'appendFindingEvent' | 'readRoadmap' | 'writeRoadmap'>,
	feature: Feature,
	directory: string,
	request: FindingDismissalRequest,
): Promise<FindingDismissalOutcome> {
	assertFeatureRemovable(feature);
	assertFindingDismissable(feature);
	const note = request.note?.trim();
	const event: FindingLedgerEventInput = {
		auditSource: feature.auditSource,
		event: 'dismissed',
		featureId: directory,
		fingerprint: feature.fingerprint,
		...(note ? { note } : {}),
		reason: request.reason,
		source: request.source,
	};
	await store.appendFindingEvent(event);
	try {
		await removeFeatureRecord(store, directory);
	} catch (removalError) {
		return { event, removalError };
	}
	return { event };
}

export function describeRecordedDismissal(event: FindingLedgerEventInput): string {
	return `dismissed event for ${event.featureId} (${event.fingerprint}, reason ${event.reason ?? 'unspecified'})`;
}
