import type { PipelineStepResultRecord } from '../../api/types.ts';

/**
 * Attempt labelling for the session report.
 *
 * A logical pipeline step can be persisted as several rows: an ordinary dispatch, the auto-fix run
 * launched when it fails, and the retry that follows. Rows written before migration 0003 carry no
 * attempt identity at all, and rows left behind by a historical duplicate execution look exactly
 * like a genuine retry — same parent, depth, sequence number and name, different outcome.
 *
 * So the label is derived, never inferred: rows that carry `attemptNumber` say what they are, and
 * rows that do not are numbered only when their group is unambiguous enough to number. Everything
 * else renders `Retry (legacy)`, which is honest about being unable to order the rows rather than
 * fabricating an ordinal the database cannot support.
 */

const LEGACY_LABEL = 'Retry (legacy)';

function groupKey(result: PipelineStepResultRecord): string {
	// The five columns that must agree for two rows to be attempts at the same logical step. JSON
	// array encoding keeps `null` distinct from the string 'null' in a stepName or definition id.
	return JSON.stringify([
		result.parentStepResultId,
		result.depth,
		result.sequenceNumber,
		result.stepDefinitionId,
		result.stepName,
	]);
}

function persistedLabel(result: PipelineStepResultRecord): string {
	return result.attemptKind === 'auto-fix'
		? `Auto-fix after attempt ${result.attemptNumber}`
		: `Attempt ${result.attemptNumber}`;
}

function labelGroup(ordered: PipelineStepResultRecord[], labels: Map<string, string>): void {
	const persisted = ordered.filter((row) => row.attemptNumber !== null);
	// One recorded ordinary attempt is just the step. Only an auto-fix row earns a badge on its
	// own, because "this row is a remediation, not the step" is not visible anywhere else.
	if (ordered.length === 1 && persisted.length === 1) {
		const only = ordered[0]!;
		if (only.attemptKind === 'auto-fix') labels.set(only.id, persistedLabel(only));
		return;
	}
	if (persisted.length === ordered.length) {
		for (const row of ordered) labels.set(row.id, persistedLabel(row));
		return;
	}
	// A group with no attempt identity anywhere is legacy data. Its rows can be numbered only when
	// stepDefinitionId anchors them to one recipe step: grouped on stepName alone, two different
	// steps that happen to share a name would be numbered as each other's retries.
	if (persisted.length === 0) {
		if (ordered.length === 1) return;
		const anchored = ordered[0]!.stepDefinitionId !== null;
		ordered.forEach((row, index) => {
			labels.set(row.id, anchored ? `Attempt ${index + 1}` : LEGACY_LABEL);
		});
		return;
	}
	// Mixed: rows written on both sides of the migration. The ones that know their own ordinal keep
	// it; the ones that do not cannot be interleaved with them without guessing.
	for (const row of ordered) {
		labels.set(row.id, row.attemptNumber === null ? LEGACY_LABEL : persistedLabel(row));
	}
}

/**
 * Map every step-result id that needs an attempt badge to its label. Ids absent from the map are
 * the only recorded attempt of their step and render no badge.
 */
export function buildAttemptLabels(
	results: readonly PipelineStepResultRecord[],
): Map<string, string> {
	const groups = new Map<string, PipelineStepResultRecord[]>();
	for (const result of results) {
		const key = groupKey(result);
		const bucket = groups.get(key);
		if (bucket) bucket.push(result);
		else groups.set(key, [result]);
	}
	const labels = new Map<string, string>();
	for (const bucket of groups.values()) {
		labelGroup(
			[...bucket].sort((left, right) => left.displayOrder - right.displayOrder),
			labels,
		);
	}
	return labels;
}
