import { describe, expect, test } from 'bun:test';

import type { MaturityArtifact, ProjectArtifactRecord } from '../../frontend/src/api/types.ts';
import type { MaturityArtifactStatus } from '../../frontend/src/api/types/maturity.ts';
import type { ArtifactInventoryEntry } from '../../frontend/src/pages/projects/detail/artifactsUtils.ts';

import {
	artifactEntryState,
	artifactRecordState,
	artifactRecordSummary,
	artifactStateSummary,
} from '../../frontend/src/pages/projects/detail/artifactGroupFilters.ts';

function record(label: string, exists: boolean, stale = false): ProjectArtifactRecord {
	return {
		ageDays: null,
		exists,
		freshness: stale ? 'stale' : 'fresh',
		label,
		mtime: null,
		path: `.aidd/${label}`,
		severity: 'required',
		sizeBytes: 0,
	};
}

function artifact(slug: string, status: MaturityArtifactStatus): MaturityArtifact {
	return { kind: 'fs-file', label: slug, mtime: null, required: true, slug, status };
}

function entry(
	slug: string,
	status: MaturityArtifactStatus,
	r: null | ProjectArtifactRecord = null,
): ArtifactInventoryEntry {
	return { artifact: artifact(slug, status), record: r };
}

const none = new Set<string>();

// The defect: a record marked not applicable was classified from `exists` alone, so the row drew a
// `skipped` badge while the group heading beside it counted the same artifact as missing — and the
// group auto-expands on a non-zero missing count, so the miscount forced the group open too.
describe('an artifact marked not applicable classifies as skipped, not missing', () => {
	test('a skipped record is not missing, and the same record unskipped still is', () => {
		const absent = record('spec.md', false);
		expect(artifactRecordState(absent, none)).toBe('missing');
		expect(artifactRecordState(absent, new Set(['spec.md']))).toBe('skipped');
	});

	test('a skipped entry is not missing, keyed by slug rather than by label', () => {
		const absent = entry('spec', 'missing', record('spec.md', false));
		expect(artifactEntryState(absent, none)).toBe('missing');
		// The row-level skip key for a grouped entry is the slug; `label` is the record's key and
		// must not satisfy it, or the two halves of the surface disagree again by a different route.
		expect(artifactEntryState(absent, new Set(['spec.md']))).toBe('missing');
		expect(artifactEntryState(absent, new Set(['spec']))).toBe('skipped');
	});

	test("the maturity report's own skipped status counts the same as the operator's skip", () => {
		expect(artifactEntryState(entry('roadmap', 'skipped'), none)).toBe('skipped');
	});

	test('skipping does not hide a stale or fresh artifact behind a wrong state', () => {
		expect(artifactRecordState(record('a', true, true), none)).toBe('stale');
		expect(artifactRecordState(record('a', true, true), new Set(['a']))).toBe('skipped');
		expect(artifactRecordState(record('b', true), none)).toBe('fresh');
	});

	test('the check-level summary excludes skipped records from both missing counts', () => {
		const requiredSkipped = record('required-skipped', false);
		const optionalMissing = {
			...record('optional-missing', false),
			severity: 'optional' as const,
		};
		const summary = artifactRecordSummary(
			[requiredSkipped, optionalMissing, record('stale', true, true), record('fresh', true)],
			new Set(['required-skipped']),
		);

		expect(summary).toEqual({
			fresh: 1,
			missing: 1,
			requiredMissing: 0,
			skipped: 1,
			stale: 1,
			total: 4,
		});
	});
});

describe('the group summary accounts for every artifact under it', () => {
	test('skipped entries leave the missing count, and so stop forcing the group open', () => {
		const summary = artifactStateSummary(
			[entry('skip-a', 'missing'), entry('skip-b', 'missing'), entry('fresh', 'fresh')],
			new Set(['skip-a', 'skip-b']),
		);
		expect(summary.missing).toBe(0);
		expect(summary.skipped).toBe(2);
		expect(summary.label).toBe('Healthy');
	});

	test('a genuinely missing artifact is still counted, still red, and still expands', () => {
		const summary = artifactStateSummary(
			[entry('missing', 'missing'), entry('skipped', 'missing'), entry('fresh', 'fresh')],
			new Set(['skipped']),
		);
		expect(summary.missing).toBe(1);
		expect(summary.skipped).toBe(1);
		expect(summary.label).toBe('1 missing');
		expect(summary.tone).toBe('red');
	});

	test('a wholly skipped group reads as not applicable rather than as healthy', () => {
		// Distinct statements: nothing here needs doing, versus everything here is done.
		const summary = artifactStateSummary(
			[entry('skip-a', 'missing'), entry('skip-b', 'missing')],
			new Set(['skip-a', 'skip-b']),
		);
		expect(summary.label).toBe('Not applicable');
		expect(summary.tone).toBe('neutral');
	});

	test('every artifact is accounted for by one of the three counts plus fresh', () => {
		const entries = [
			entry('missing', 'missing'),
			entry('stale', 'stale'),
			entry('skip-a', 'missing'),
			entry('fresh', 'fresh'),
			entry('skip-b', 'missing'),
		];
		const summary = artifactStateSummary(entries, new Set(['skip-a', 'skip-b']));
		const fresh = entries.length - summary.missing - summary.stale - summary.skipped;
		expect(summary.missing + summary.stale + summary.skipped + fresh).toBe(entries.length);
		expect(fresh).toBe(1);
	});
});
