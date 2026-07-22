import { describe, expect, test } from 'bun:test';

import {
	buildRunFileChangeTooltipModel,
	fileChangeSourceNote,
	fileChangeTelemetryNote,
} from '../../frontend/src/pages/runs/runFileChangeTooltip.ts';

describe('run file change tooltip model', () => {
	test('shows path text and ledger source copy for edited files', () => {
		const model = buildRunFileChangeTooltipModel({
			kind: 'edited',
			paths: ['.aidd/features/example/feature.json'],
			source: 'ledger',
			truncated: false,
		});

		expect(model.title).toBe('Edited files');
		expect(model.paths).toEqual(['.aidd/features/example/feature.json']);
		expect(model.sourceNote).toBe('Recorded in run ledger.');
		expect(model.countNote).toBe(fileChangeTelemetryNote);
		expect(model.truncatedNote).toBeNull();
	});

	test('shows unavailable copy when counts exist without recorded paths', () => {
		const model = buildRunFileChangeTooltipModel({
			kind: 'created',
			paths: [],
			source: 'unavailable',
			truncated: false,
		});

		expect(model.title).toBe('Created files');
		expect(model.sourceNote).toBe('Path list unavailable for this older run.');
		expect(model.paths).toEqual([]);
	});

	test('returns iteration artifact source copy and truncation note', () => {
		const model = buildRunFileChangeTooltipModel({
			kind: 'edited',
			paths: ['.aidd/CHANGELOG.md'],
			source: 'iteration-artifacts',
			truncated: true,
		});

		expect(fileChangeSourceNote('iteration-artifacts')).toBe(
			'Recovered from iteration artifacts.'
		);
		expect(model.truncatedNote).toBe('Showing first 50 paths.');
	});
});
