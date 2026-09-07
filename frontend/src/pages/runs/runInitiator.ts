import type { RunInitiator, RunRecord } from '../../api/types.ts';
import type { Tone } from '../../lib/tones.ts';

/**
 * The toolbar vocabulary: the two recorded values, the un-recorded one, and 'all'.
 *
 * 'unknown' is offered as a filter of its own rather than folded into either recorded value. It is
 * what every row with nothing recorded carries, and a reader narrowing to 'operator'
 * must not be handed rows aidd never asked anybody about.
 */
export type UnifiedInitiatorFilter = 'all' | 'unknown' | RunInitiator;

export interface RunInitiatorPresentation {
	/** Badge text for the Runs list. */
	label: string;
	/** The same fact in plain words — the badge tooltip, and the run detail panel's line. */
	sentence: string;
	tone: Tone;
}

// Null is its own state, not a synonym for 'operator'. Reporting an unrecorded initiator as
// operator-initiated is precisely the invented fact this feature exists to remove from run
// history, so it gets its own label, its own tone and its own filter value.
const PRESENTATION: Record<'unknown' | RunInitiator, RunInitiatorPresentation> = {
	automatic: {
		label: 'Automatic',
		sentence: 'aidd started this run on its own — nobody asked for it.',
		// The one value worth spotting from across the list: everything aidd did while you were
		// away. Violet is unused by the outcome badge beside it, so the two never read as one
		// status.
		tone: 'violet',
	},
	operator: {
		label: 'Operator',
		sentence: 'Somebody asked for this run.',
		tone: 'neutral',
	},
	unknown: {
		label: 'Unknown',
		sentence: 'Not recorded. This run predates run trigger provenance.',
		tone: 'neutral',
	},
};

function runInitiatorValue(run: Pick<RunRecord, 'initiator'>): 'unknown' | RunInitiator {
	// Covers both the recorded null and a payload from an older backend that omits the field.
	return run.initiator ?? 'unknown';
}

export function presentRunRecordInitiator(
	run: Pick<RunRecord, 'initiator'>,
): RunInitiatorPresentation {
	return PRESENTATION[runInitiatorValue(run)];
}
