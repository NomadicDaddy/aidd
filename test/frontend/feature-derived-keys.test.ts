import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import type { ProjectFeature } from '../../frontend/src/api/types/projects/features.ts';

import { ROADMAP_DERIVED_FEATURE_KEYS } from '../../backend/src/services/project/listings/featureMappers.ts';
import {
	NON_PERSISTED_FEATURE_KEYS,
	serializeFeatureForWrite,
} from '../../shared/src/metadata/store/serialize.ts';
import {
	DERIVED_FEATURE_KEYS,
	onDiskFeature,
} from '../../frontend/src/api/types/projects/features.ts';

const FRONTEND_SRC = resolve(import.meta.dir, '../../frontend/src');

function feature(extra: Record<string, unknown> = {}): ProjectFeature {
	return {
		category: 'ui',
		createdAt: '2026-09-01T00:00:00.000Z',
		dependencies: [],
		description: 'a description',
		directory: 'remediation-20260902-thing',
		id: 'remediation-20260902-thing',
		milestone: 'v3.0',
		passes: false,
		priority: 2,
		status: 'backlog',
		title: 'A thing',
		...extra,
	};
}

// The defect: the dialog's `Raw feature.json` block serialized the API's shape, which carries two
// keys the file on disk does not — `directory`, injected by the metadata store on read, and
// `milestone`, stamped by the API from roadmap.json. An operator comparing the panel against the
// file finds keys in one and not the other, and the reasonable conclusion is that the file is stale.
describe('the raw block shows the record as feature.json holds it', () => {
	test('the derived keys are exactly the ones the two writers do not persist', () => {
		// Three declarations, one fact. This is the guard: the frontend cannot drift into stripping
		// a key that does round-trip, and cannot miss one a writer newly stops persisting.
		expect([...DERIVED_FEATURE_KEYS].sort()).toEqual(
			[...NON_PERSISTED_FEATURE_KEYS, ...ROADMAP_DERIVED_FEATURE_KEYS].sort(),
		);
		expect(DERIVED_FEATURE_KEYS.length).toBeGreaterThan(0);
	});

	test('the writer really does drop them, and really does keep everything else', () => {
		// Read from the write boundary rather than from the constant beside it, so the constant
		// cannot quietly disagree with the function it documents.
		const written = serializeFeatureForWrite(feature() as never);
		for (const key of NON_PERSISTED_FEATURE_KEYS) expect(written).not.toHaveProperty(key);

		// Stated from the other side: a list that grew would silently hide real fields, and
		// approval, blockingContext, fingerprint and justFinishedAt all do reach disk.
		const rich = serializeFeatureForWrite(
			feature({
				approval: { decidedAt: null, state: 'pending' },
				blockingContext: { reason: 'waiting' },
				fingerprint: 'abc123',
				justFinishedAt: '2026-09-02T00:00:00.000Z',
			}) as never,
		);
		expect(rich).toHaveProperty('approval');
		expect(rich).toHaveProperty('blockingContext');
		expect(rich).toHaveProperty('fingerprint');
		expect(rich).toHaveProperty('justFinishedAt');
	});

	test('onDiskFeature strips the derived keys and nothing else', () => {
		const input = feature({ spec: '1. Verify something', summary: 'a summary' });
		const shown = onDiskFeature(input);
		expect(shown).not.toHaveProperty('directory');
		expect(shown).not.toHaveProperty('milestone');
		expect(shown).toHaveProperty('spec');
		expect(shown).toHaveProperty('summary');

		// The property, stated against the write path rather than against a second hand-written
		// list: what the dialog shows is what a write of this same record would put on disk, minus
		// only the keys the API stamped from the roadmap and never persisted.
		const written = serializeFeatureForWrite(input as never);
		const persisted = Object.keys(written).filter(
			(key) => !ROADMAP_DERIVED_FEATURE_KEYS.includes(key),
		);
		expect(Object.keys(shown).sort()).toEqual(persisted.sort());
	});

	test('the dialog waits for the full record before claiming to show the file', async () => {
		const dialog = await Bun.file(
			resolve(FRONTEND_SRC, 'pages/projects/detail/FeatureDetailsDialog.tsx'),
		).text();
		// The list row drops spec, notes, affectedFiles and aiddReport, so serializing it rendered a
		// feature.json missing four keys the file has — the same disagreement from the other end.
		expect(dialog).toContain(
			'const rawJson = detail.data ? JSON.stringify(onDiskFeature(full), null, 2) : null;',
		);
		expect(dialog).toContain("'Loading the full record…'");
		expect(dialog).toContain("'The full record could not be loaded.'");
		// The two keys leave the raw block but stay named in the Metadata list, marked as derived,
		// so they read as coming from elsewhere rather than as missing from the record.
		expect(dialog).toContain('derived: DERIVED_FEATURE_KEYS.includes(key)');
		expect(dialog).toContain('{row.derived ? (');
	});
});
