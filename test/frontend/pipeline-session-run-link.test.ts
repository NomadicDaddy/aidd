import { describe, expect, test } from 'bun:test';

import { pipelineStepLiveConsoleHref } from '../../frontend/src/pages/pipelineSessions/pipelineSessionLinks.ts';

describe('Pipeline Session managed-run navigation', () => {
	test('builds an encoded Live Console deep link for a managed step', () => {
		expect(pipelineStepLiveConsoleHref('run/with?reserved')).toBe(
			'/runs?run=run%2Fwith%3Freserved',
		);
	});
});
