import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { ApiError } from '../../frontend/src/api/client.ts';
import { retryUnlessClientError } from '../../frontend/src/api/retry.ts';
import { createQueryClient } from '../../frontend/src/queryClient.ts';

const FRONTEND_SRC = resolve(import.meta.dir, '../../frontend/src');

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

describe('QueryClient defaults carry the retry policy', () => {
	function defaultRetry(): (failureCount: number, error: Error) => boolean {
		const queries = createQueryClient().getDefaultOptions().queries;
		const retry = queries?.retry;
		// A `retry` that is not a predicate — absent, `true`, or a bare number — is precisely the
		// regression this suite exists to catch, so it must fail here rather than be coerced.
		if (typeof retry !== 'function') {
			throw new TypeError(
				`Expected a retry predicate on query defaults, got ${typeof retry}`,
			);
		}
		return retry as (failureCount: number, error: Error) => boolean;
	}

	test('installs the shared 4xx-aware predicate, not React Query’s blind default', () => {
		expect(createQueryClient().getDefaultOptions().queries?.retry).toBe(retryUnlessClientError);
	});

	test('keeps the freshness and focus behavior the app was tuned for', () => {
		const queries = createQueryClient().getDefaultOptions().queries;

		expect(queries?.staleTime).toBe(30_000);
		expect(queries?.refetchOnWindowFocus).toBe(false);
	});

	test('a query inheriting the defaults stops immediately on 401/403/404', () => {
		const retry = defaultRetry();

		for (const status of [401, 403, 404]) {
			expect(retry(0, new ApiError('client error', status))).toBe(false);
		}
	});

	test('a query inheriting the defaults keeps the three-attempt cap for 5xx and network failures', () => {
		const retry = defaultRetry();

		for (const error of [new ApiError('bad gateway', 502), new Error('network down')]) {
			expect(retry(0, error)).toBe(true);
			expect(retry(2, error)).toBe(true);
			expect(retry(3, error)).toBe(false);
		}
	});

	test('App mounts one module-level client from the factory', () => {
		const app = readFileSync(join(FRONTEND_SRC, 'App.tsx'), 'utf-8');

		expect(app).toContain('const queryClient = createQueryClient();');
		expect(app).toContain("import { createQueryClient } from './queryClient.ts';");
		// An inline `new QueryClient({...})` here is how the defaults drifted out of reach of the
		// hooks in the first place.
		expect(app).not.toContain('new QueryClient(');
	});
});

describe('core list queries inherit the retry policy', () => {
	/**
	 * The list hooks deliberately do NOT each name `retryUnlessClientError`; they inherit it from
	 * the client defaults. What has to hold is the inverse: none of them may set a `retry` of its
	 * own that silently restores the blind default. Anything that does opt out must name the
	 * shared predicate explicitly.
	 */
	const LIST_HOOKS = [
		['hooks/useProjects.ts', 'Projects'],
		['hooks/useSkills.ts', 'Skills'],
		['hooks/useRecipes.ts', 'Recipes'],
		['hooks/usePipelineSessions.ts', 'pipeline sessions'],
	] as const;

	for (const [file, label] of LIST_HOOKS) {
		test(`${label} never overrides retry with anything but the shared predicate`, () => {
			const source = readFileSync(join(FRONTEND_SRC, file), 'utf-8');
			const overrides = [...source.matchAll(/\bretry:\s*([^,\n]+)/g)].map((m) =>
				(m[1] ?? '').trim(),
			);

			for (const override of overrides) {
				expect(override).toBe('retryUnlessClientError');
			}
		});
	}

	test('the four hook modules exist and still register list queries', () => {
		for (const [file] of LIST_HOOKS) {
			const source = readFileSync(join(FRONTEND_SRC, file), 'utf-8');

			expect(source).toMatch(/use(?:Infinite)?Query\(/);
		}
	});
});
