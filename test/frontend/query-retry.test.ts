import { describe, expect, test } from 'bun:test';
import { ApiError } from '../../frontend/src/api/client.ts';
import { retryUnlessClientError } from '../../frontend/src/api/retry.ts';

describe('retryUnlessClientError (React Query retry predicate)', () => {
	test('does not retry a 401 (the regression: a bad token must not be retried 3×)', () => {
		expect(retryUnlessClientError(0, new ApiError('unauthorized', 401))).toBe(false);
	});

	test('does not retry any 4xx (403, 404, 422)', () => {
		expect(retryUnlessClientError(0, new ApiError('forbidden', 403))).toBe(false);
		expect(retryUnlessClientError(0, new ApiError('not found', 404))).toBe(false);
		expect(retryUnlessClientError(0, new ApiError('unprocessable', 422))).toBe(false);
	});

	test('retries a 5xx until the cap, then stops', () => {
		const error = new ApiError('server error', 503);
		expect(retryUnlessClientError(0, error)).toBe(true);
		expect(retryUnlessClientError(2, error)).toBe(true);
		expect(retryUnlessClientError(3, error)).toBe(false);
	});

	test('retries a non-ApiError (network blip) until the cap', () => {
		const error = new Error('network down');
		expect(retryUnlessClientError(0, error)).toBe(true);
		expect(retryUnlessClientError(3, error)).toBe(false);
	});

	test('treats the 400 boundary as a client error and 500 as retryable', () => {
		expect(retryUnlessClientError(0, new ApiError('bad request', 400))).toBe(false);
		expect(retryUnlessClientError(0, new ApiError('internal', 500))).toBe(true);
	});
});
