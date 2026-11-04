import { describe, expect, test } from 'bun:test';
import { validateFeatureCollection } from 'aidd-shared/metadata/features';
import type { Feature } from 'aidd-shared/metadata/features';

import {
	NOTES_TRIM_THRESHOLD,
	noteTextLength,
} from '../../shared/src/metadata/features/notes-size.ts';
import { NOTES_TRIM_THRESHOLD as HELPER_THRESHOLD } from '../../skills/consolidate-features/scripts/trim-notes.ts';

function feature(partial: { id: string } & Partial<Feature>): Feature {
	return { passes: false, status: 'backlog', ...partial };
}

function sizeWarnings(features: Feature[]): string[] {
	return validateFeatureCollection(features)
		.warnings.filter((warning) => warning.message.startsWith('Notes hold'))
		.map((warning) => warning.id);
}

describe('notes size warning', () => {
	test('counts note text for every valid notes shape', () => {
		expect(noteTextLength(undefined)).toBe(0);
		expect(noteTextLength('abc')).toBe(3);
		expect(noteTextLength(['ab', 'cde', 7])).toBe(5);
		expect(noteTextLength({ text: 'not notes' })).toBe(0);
	});

	test('names a record only once its notes pass the threshold, whatever its status', () => {
		const atLimit = 'x'.repeat(NOTES_TRIM_THRESHOLD);
		const result = sizeWarnings([
			feature({ id: 'at-limit', notes: [atLimit] }),
			feature({ id: 'over-array', notes: [atLimit, 'y'] }),
			feature({ id: 'over-string', notes: `${atLimit}y` }),
			feature({
				id: 'over-completed',
				notes: [`${atLimit}y`],
				passes: true,
				status: 'completed',
			}),
		]);
		expect(result).toEqual(['over-array', 'over-string', 'over-completed']);
	});

	test('is a warning, never an issue that fails validation', () => {
		const result = validateFeatureCollection([
			feature({ id: 'long', notes: ['z'.repeat(NOTES_TRIM_THRESHOLD + 1)] }),
		]);
		expect(result.issues).toEqual([]);
		expect(result.warnings.map((warning) => warning.message)).toContain(
			`Notes hold ${NOTES_TRIM_THRESHOLD + 1} characters (over ${NOTES_TRIM_THRESHOLD}); ` +
				"run consolidate-features' notes trim to archive the history and keep current state",
		);
	});

	test('uses the same threshold as the staged trim helper', () => {
		expect(HELPER_THRESHOLD).toBe(NOTES_TRIM_THRESHOLD);
	});
});
