import { describe, expect, test } from 'bun:test';

import { normalizeRunCommitsResponse } from '../../frontend/src/api/runs.ts';

describe('run commits API normalization', () => {
	test('fills missing file-change paths for older commit responses', () => {
		const response = normalizeRunCommitsResponse({
			commits: [],
			commitsCreatedCount: 0,
			filesCreated: 1,
			filesEdited: 2,
			reason: null,
			state: 'ok',
		});

		expect(response.fileChanges).toEqual({
			created: [],
			edited: [],
			source: 'unavailable',
			truncated: false,
		});
		expect(response.filesCreated).toBe(1);
		expect(response.filesEdited).toBe(2);
	});

	test('keeps recorded file-change paths intact', () => {
		const response = normalizeRunCommitsResponse({
			commits: [],
			commitsCreatedCount: 0,
			fileChanges: {
				created: ['src/new.ts'],
				edited: ['src/edit.ts'],
				source: 'ledger',
				truncated: true,
			},
			filesCreated: 1,
			filesEdited: 1,
			reason: null,
			state: 'ok',
		});

		expect(response.fileChanges).toEqual({
			created: ['src/new.ts'],
			edited: ['src/edit.ts'],
			source: 'ledger',
			truncated: true,
		});
	});
});
