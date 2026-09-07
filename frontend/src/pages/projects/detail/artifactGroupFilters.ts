import type { ProjectArtifactRecord } from '../../../api/types.ts';
import type { Tone } from '../../../lib/tones.ts';
import type { ArtifactInventoryEntry } from './artifactsUtils.ts';

export type ArtifactFilter = 'all' | 'missing' | 'stale';
type ArtifactState = 'fresh' | 'skipped' | Exclude<ArtifactFilter, 'all'>;

export interface ArtifactRecordSummary {
	fresh: number;
	missing: number;
	requiredMissing: number;
	skipped: number;
	stale: number;
	total: number;
}

export interface ArtifactSummaryPresentation {
	label: string;
	missing: number;
	skipped: number;
	stale: number;
	tone: Tone;
}

/** One status sentence for grouped maturity entries and ungrouped artifact records. */
export function artifactSummaryPresentation({
	missing,
	skipped,
	stale,
	total,
}: Pick<
	ArtifactRecordSummary,
	'missing' | 'skipped' | 'stale' | 'total'
>): ArtifactSummaryPresentation {
	const counts = { missing, skipped, stale };
	if (missing > 0) return { ...counts, label: `${missing} missing`, tone: 'red' };
	if (stale > 0) return { ...counts, label: `${stale} stale`, tone: 'amber' };
	if (skipped > 0 && skipped === total)
		return { ...counts, label: 'Not applicable', tone: 'neutral' };
	return { ...counts, label: 'Healthy', tone: 'emerald' };
}

/**
 * Both state functions take the project's skip set, rather than the caller applying it afterwards.
 * An artifact the operator marked not applicable is not a missing artifact, and the surface used to
 * say both at once: the row drew a `skipped` badge while the group heading beside it counted the
 * same artifact as missing, and because the group auto-expands on a non-zero missing count, the
 * miscount also forced the group open.
 *
 * The set is a required parameter and not an optional one, because the failure it prevents is a
 * call site that forgets to pass it — which is exactly the state this replaced. Taking the set also
 * puts the two skip keys in one place: a record is keyed by `label` and a maturity entry by
 * `artifact.slug`, a split ArtifactGroups.tsx was already making by hand at the row level.
 */
function freshnessState(record: ProjectArtifactRecord): Exclude<ArtifactState, 'skipped'> {
	if (!record.exists) return 'missing';
	return record.freshness === 'stale' ? 'stale' : 'fresh';
}

export function artifactRecordState(
	record: ProjectArtifactRecord,
	skipSet: Set<string>,
): ArtifactState {
	return skipSet.has(record.label) ? 'skipped' : freshnessState(record);
}

export function artifactEntryState(
	entry: ArtifactInventoryEntry,
	skipSet: Set<string>,
): ArtifactState {
	// `status === 'skipped'` is the maturity report's own answer for an entry with no record, which
	// MaturityArtifactRow already reads directly. Both sources mean the same thing here.
	if (skipSet.has(entry.artifact.slug) || entry.artifact.status === 'skipped') return 'skipped';
	if (entry.record) return freshnessState(entry.record);
	if (entry.artifact.status === 'missing' || entry.artifact.status === 'fail') return 'missing';
	return entry.artifact.status === 'stale' ? 'stale' : 'fresh';
}

/** The check-level counts after applying the same not-applicable rule as the inventory rows. */
export function artifactRecordSummary(
	records: ProjectArtifactRecord[],
	skipSet: Set<string>,
): ArtifactRecordSummary {
	const states = records.map((record) => artifactRecordState(record, skipSet));
	return {
		fresh: states.filter((state) => state === 'fresh').length,
		missing: states.filter((state) => state === 'missing').length,
		requiredMissing: records.filter(
			(record) =>
				record.severity === 'required' &&
				artifactRecordState(record, skipSet) === 'missing',
		).length,
		skipped: states.filter((state) => state === 'skipped').length,
		stale: states.filter((state) => state === 'stale').length,
		total: records.length,
	};
}

/**
 * `skipped` is returned rather than merely subtracted, so every artifact in a group is still
 * accounted for by the summary. A group whose only outstanding entries are skipped ones reads as
 * not applicable, which is a different statement from healthy and is why it gets its own label.
 */
export function artifactStateSummary(
	entries: ArtifactInventoryEntry[],
	skipSet: Set<string>,
): ArtifactSummaryPresentation {
	const states = entries.map((entry) => artifactEntryState(entry, skipSet));
	const missing = states.filter((state) => state === 'missing').length;
	const skipped = states.filter((state) => state === 'skipped').length;
	const stale = states.filter((state) => state === 'stale').length;
	return artifactSummaryPresentation({ missing, skipped, stale, total: states.length });
}
