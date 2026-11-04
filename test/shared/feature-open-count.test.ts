import { describe, expect, test } from 'bun:test';
import { validateFeatureCollection } from 'aidd-shared/metadata/features';
import type { Feature } from 'aidd-shared/metadata/features';

import { MAX_OPEN_FEATURES } from '../../shared/src/metadata/features/open-features.ts';

function feature(id: string, status: string): Feature {
	return { id, passes: false, status };
}

function openWarnings(features: Feature[]) {
	return validateFeatureCollection(features).warnings.filter((warning) =>
		warning.message.includes('are in_progress'),
	);
}

describe('open feature count warning', () => {
	test('stays quiet at the limit and counts only in_progress records', () => {
		const atLimit = Array.from({ length: MAX_OPEN_FEATURES }, (_, i) =>
			feature(`open-${i}`, 'in_progress'),
		);
		const others = ['backlog', 'waiting_approval', 'deferred', 'completed'].map((status) =>
			feature(`not-open-${status}`, status),
		);
		expect(openWarnings([...atLimit, ...others])).toEqual([]);
	});

	test('names every open record once the limit is passed, as a warning only', () => {
		const open = ['c-open', 'a-open', 'b-open'].map((id) => feature(id, 'in_progress'));
		const result = validateFeatureCollection([...open, feature('queued', 'backlog')]);
		const warnings = openWarnings([...open, feature('queued', 'backlog')]);
		expect(result.issues).toEqual([]);
		expect(warnings.map((warning) => warning.id)).toEqual(['a-open', 'b-open', 'c-open']);
		expect(warnings[0]?.message).toStartWith(
			`3 features are in_progress (more than ${MAX_OPEN_FEATURES}): a-open, b-open, c-open.`,
		);
	});
});
