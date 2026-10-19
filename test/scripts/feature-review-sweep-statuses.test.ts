import { expect, test } from 'bun:test';
import { FEATURE_STATUSES } from 'aidd-shared/metadata/features';

import { VALID_STATUSES } from '../../scripts/lib/feature-review-sweep/constants.ts';

// The sweep reported every deferred record as "invalid status" for a release after deferred became
// a status, because it kept its own list. It now takes the canonical list, and this keeps it so.
test('the sweep accepts every canonical feature status', () => {
	expect(FEATURE_STATUSES.filter((status) => !VALID_STATUSES.has(status))).toEqual([]);
	expect(VALID_STATUSES.has('deferred')).toBe(true);
	expect(VALID_STATUSES.has('done')).toBe(false);
});
