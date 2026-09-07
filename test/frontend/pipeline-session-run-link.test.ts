import { describe, expect, test } from 'bun:test';

import { pipelineStepLiveConsoleHref } from '../../frontend/src/pages/pipelineSessions/pipelineSessionLinks.ts';
import { initialSelectedRunId } from '../../frontend/src/pages/runs/runsUtils.ts';

describe('Pipeline Session managed-run navigation', () => {
	test('builds an encoded Live Console deep link for a managed step', () => {
		expect(pipelineStepLiveConsoleHref('run/with?reserved')).toBe(
			'/runs?run=run%2Fwith%3Freserved',
		);
	});

	test('selects the managed run from an initial Live Console deep link', () => {
		expect(initialSelectedRunId(new URLSearchParams('run=run%2Fwith%3Freserved'))).toBe(
			'run/with?reserved',
		);
	});
});
