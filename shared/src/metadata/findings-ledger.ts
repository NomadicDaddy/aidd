import { z } from 'zod/v4';

import { findingDismissalReasons } from '../contracts/finding-dispositions.ts';

export const findingLedgerEventKinds = [
	'dismissed',
	'emitted',
	'recurred',
	'remediated',
	'suppressed-dismissed',
	'suppressed-duplicate',
] as const;

export const findingLedgerEventSchema = z.object({
	at: z.iso.datetime(),
	auditSource: z.string().min(1),
	event: z.enum(findingLedgerEventKinds),
	featureId: z.string().min(1),
	fingerprint: z.string().regex(/^f1-[a-f0-9]{64}$/),
	note: z.string().optional(),
	priorFeatureId: z.string().min(1).optional(),
	reason: z.enum(findingDismissalReasons).optional(),
	/** The run that produced the event. Absent for lifecycle changes made outside a run
	 * (a web or CLI dismissal, a completion edit); never a sentinel string. */
	runId: z.string().min(1).optional(),
	source: z.string().min(1).optional(),
});

export type FindingLedgerEvent = z.infer<typeof findingLedgerEventSchema>;
export type FindingLedgerEventInput = { at?: string } & Omit<FindingLedgerEvent, 'at'>;

/** What a tolerant ledger read returns: every line that parsed, plus how many did not. */
export interface FindingLedgerRead {
	/** False when the last line is torn (no trailing newline); the next append must add one. */
	endsWithNewline: boolean;
	events: FindingLedgerEvent[];
	/** Lines that were neither blank nor a valid event (a torn write, a hand edit). */
	skippedLines: number;
}

/**
 * The identity an append is idempotent on. Two writes with the same run, fingerprint, event
 * kind, and feature are the same fact: a crash-recovery replay, a retried dismissal, or a
 * repeated completion must not add a second line.
 */
export function findingLedgerEventKey(
	event: Pick<FindingLedgerEvent, 'event' | 'featureId' | 'fingerprint' | 'runId'>,
): string {
	return [event.runId ?? '', event.fingerprint, event.event, event.featureId].join(' ');
}
