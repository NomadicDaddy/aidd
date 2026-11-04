import type { Feature, FeatureValidationIssue } from './types.ts';

// Notes are append-only for coding runs: every closed finding adds a revision entry to its source
// feature, so a record's history only grows. Past this many characters the history buries what a
// run needs from the record. consolidate-features' notes trim archives the exact original and
// leaves a short current-state note; this check names the records that are due one. A warning,
// never an issue: a long history is a reading cost, not a defect that should stop a run.
export const NOTES_TRIM_THRESHOLD = 3000;

/** Total characters of note text, whatever shape `notes` has (missing, a string, or an array). */
export function noteTextLength(notes: unknown): number {
	if (typeof notes === 'string') return notes.length;
	if (!Array.isArray(notes)) return 0;
	let total = 0;
	for (const entry of notes) if (typeof entry === 'string') total += entry.length;
	return total;
}

export function notesSizeWarnings(features: Feature[]): FeatureValidationIssue[] {
	const warnings: FeatureValidationIssue[] = [];
	for (const feature of features) {
		const length = noteTextLength(feature.notes);
		if (length <= NOTES_TRIM_THRESHOLD) continue;
		warnings.push({
			id: feature.directory ?? feature.id,
			message:
				`Notes hold ${length} characters (over ${NOTES_TRIM_THRESHOLD}); ` +
				"run consolidate-features' notes trim to archive the history and keep current state",
		});
	}
	return warnings;
}
