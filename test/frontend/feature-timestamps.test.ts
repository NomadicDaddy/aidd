import { describe, expect, test } from 'bun:test';

import type { ProjectFeature } from '../../frontend/src/api/types.ts';

import {
	featureAddedAt,
	featureCompletedAt,
} from '../../frontend/src/pages/projects/detail/featureTimestamps.ts';

function makeFeature(fields: Record<string, unknown>): ProjectFeature {
	return { id: 'a-feature', title: 'A feature', ...fields } as unknown as ProjectFeature;
}

describe('featureAddedAt', () => {
	test('parses createdAt into both the ISO string and the epoch', () => {
		const added = featureAddedAt(makeFeature({ createdAt: '2026-06-12T05:28:41.617Z' }));
		expect(added?.iso).toBe('2026-06-12T05:28:41.617Z');
		expect(added?.timeValue).toBe(Date.parse('2026-06-12T05:28:41.617Z'));
	});

	test('is null for an absent, empty or unparseable createdAt', () => {
		expect(featureAddedAt(makeFeature({}))).toBeNull();
		expect(featureAddedAt(makeFeature({ createdAt: '' }))).toBeNull();
		expect(featureAddedAt(makeFeature({ createdAt: 'whenever' }))).toBeNull();
	});
});

describe('featureCompletedAt', () => {
	test('prefers the stamped completedAt', () => {
		const completed = featureCompletedAt(
			makeFeature({
				completedAt: '2026-07-01T00:00:00.000Z',
				status: 'completed',
				updatedAt: '2026-08-20T00:00:00.000Z',
			}),
		);
		expect(completed?.iso).toBe('2026-07-01T00:00:00.000Z');
	});

	test('falls back to updatedAt only for a record with no stamp', () => {
		const completed = featureCompletedAt(
			makeFeature({ status: 'completed', updatedAt: '2026-08-20T00:00:00.000Z' }),
		);
		expect(completed?.iso).toBe('2026-08-20T00:00:00.000Z');
	});

	test('is null for every status but completed, however recently the record was written', () => {
		for (const status of ['backlog', 'in_progress', 'waiting_approval', 'unknown']) {
			expect(
				featureCompletedAt(
					makeFeature({
						completedAt: '2026-07-01T00:00:00.000Z',
						status,
						updatedAt: '2026-08-20T00:00:00.000Z',
					}),
				),
			).toBeNull();
		}
	});

	// `justFinishedAt` holds two distinct values across the 23 records carrying it — a one-time
	// backfill constant, not an instant anything happened at — so it is not a fallback.
	test('ignores justFinishedAt', () => {
		expect(
			featureCompletedAt(
				makeFeature({ justFinishedAt: '2026-01-01T00:00:00.000Z', status: 'completed' }),
			),
		).toBeNull();
	});

	test('is null when the only candidate timestamp is unparseable', () => {
		expect(
			featureCompletedAt(makeFeature({ completedAt: 'soon', status: 'completed' })),
		).toBeNull();
	});
});
