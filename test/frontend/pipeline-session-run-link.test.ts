import { describe, expect, test } from 'bun:test';

import { pipelineStepLiveConsoleHref } from '../../frontend/src/pages/pipelineSessions/pipelineSessionLinks.ts';
import { initialSelection } from '../../frontend/src/pages/runs/unifiedEntries.ts';

describe('Pipeline Session managed-run navigation', () => {
	test('builds an encoded Live Console deep link for a managed step', () => {
		expect(pipelineStepLiveConsoleHref('run/with?reserved')).toBe(
			'/runs?run=run%2Fwith%3Freserved',
		);
	});

	test('the Runs page selects the same managed run the deep link encodes', () => {
		const href = pipelineStepLiveConsoleHref('run/with?reserved');
		const query = new URL(href, 'http://panel.invalid').searchParams;
		expect(initialSelection(query)).toEqual({ id: 'run/with?reserved', kind: 'run' });
	});
});
