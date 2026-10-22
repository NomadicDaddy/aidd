import { describe, expect, test } from 'bun:test';

import { detectBlockedVerificationAdmission } from '../../cli/src/modes/coding/verification.ts';

const detect = (chunk: string) =>
	detectBlockedVerificationAdmission([{ chunk, type: 'assistant_text' }]);

// rollshift 05025fa (2026-10-22): a statically verified docs-only correction was parked as
// waiting_approval because its final line repeated the run's note that live UI verification was
// blocked while saying no browser pass was owed.
describe('blocked-verification detection when no live check is owed', () => {
	test('a line that says no live check is owed does not park', () => {
		for (const line of [
			'No application source changed, so no browser pass is owed — consistent with the run context note that live UI verification is blocked this iteration.',
			'Docs only: no live verification is needed, even though verification is blocked in this session.',
			'Browser verification is not required for a .aidd text edit; it could not be run in-session anyway.',
		]) {
			expect(detect(line)).toBeUndefined();
		}
	});

	test('an admission without that statement still parks', () => {
		expect(
			detect('Live UI verification is blocked this iteration, so the page was not checked.')
				?.phrase,
		).toBe('verification is blocked');
		expect(
			detect('I could not verify the rendered page; no screenshots were taken.'),
		).toBeDefined();
	});
});
