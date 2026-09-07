import { describe, expect, test } from 'bun:test';

import { createInvalidationCoalescer } from '../../frontend/src/lib/invalidationCoalescer.ts';

/**
 * The backend log for a fleet fan-out held seven concurrent `GET /api/v1/runs` and nine
 * `GET /api/v1/projects`, one per `run_status` frame, every one served in full. These assert the
 * coalescer's two guarantees: a burst produces one invalidation per key, and a key already
 * refetching does not get a second request until the first settles.
 */
function harness() {
	const calls: { cancelRefetch: boolean | undefined; queryKey: unknown[] }[] = [];
	const settlers: (() => void)[] = [];
	let pending: null | (() => void) = null;

	const coalescer = createInvalidationCoalescer(
		{
			invalidateQueries: (filters) => {
				calls.push({ cancelRefetch: filters.cancelRefetch, queryKey: filters.queryKey });
				return new Promise<void>((resolve) => settlers.push(resolve));
			},
		},
		{
			delay: (run) => {
				pending = run;
				return () => {
					pending = null;
				};
			},
		},
	);

	return {
		calls,
		coalescer,
		/** Run the scheduled flush, as the burst window elapsing would. */
		async flush(): Promise<void> {
			const run = pending;
			pending = null;
			run?.();
			await Promise.resolve();
		},
		keys: () => calls.map((call) => call.queryKey),
		/** Resolve every outstanding refetch, as the network would. */
		async settleAll(): Promise<void> {
			const outstanding = settlers.splice(0, settlers.length);
			for (const settle of outstanding) settle();
			await Promise.resolve();
			await Promise.resolve();
		},
	};
}

describe('realtime invalidation coalescing', () => {
	test('collapses a burst into one invalidation per key', async () => {
		const h = harness();

		// Seven run_status frames from one fleet fan-out.
		for (let index = 0; index < 7; index += 1) {
			h.coalescer.invalidate(['runs']);
			h.coalescer.invalidate(['projects']);
		}
		await h.flush();

		expect(h.keys()).toEqual([['runs'], ['projects']]);
	});

	test('never cancels a refetch that is already fetching the same key', async () => {
		const h = harness();

		h.coalescer.invalidate(['runs']);
		await h.flush();

		expect(h.calls[0]?.cancelRefetch).toBe(false);
	});

	test('holds a key back while its refetch is in flight, then covers what arrived', async () => {
		const h = harness();

		h.coalescer.invalidate(['runs']);
		await h.flush();
		expect(h.keys()).toEqual([['runs']]);

		// Frames that land during the slow refetch must not each start their own request...
		h.coalescer.invalidate(['runs']);
		h.coalescer.invalidate(['runs']);
		await h.flush();
		expect(h.keys()).toEqual([['runs']]);

		// ...but they must not be lost either: the first refetch's result predates them.
		await h.settleAll();
		await h.flush();
		expect(h.keys()).toEqual([['runs'], ['runs']]);
	});

	test('lets an unrelated key through while another is in flight', async () => {
		const h = harness();

		h.coalescer.invalidate(['runs']);
		await h.flush();
		h.coalescer.invalidate(['runs']);
		h.coalescer.invalidate(['projects']);
		await h.flush();

		expect(h.keys()).toEqual([['runs'], ['projects']]);
	});

	test('keys on the whole key, not its first element', async () => {
		const h = harness();

		h.coalescer.invalidate(['app-launch', 'alpha']);
		h.coalescer.invalidate(['app-launch', 'beta']);
		h.coalescer.invalidate(['app-launch', 'alpha']);
		await h.flush();

		expect(h.keys()).toEqual([
			['app-launch', 'alpha'],
			['app-launch', 'beta'],
		]);
	});

	test('drops a pending flush on dispose', async () => {
		const h = harness();

		h.coalescer.invalidate(['runs']);
		h.coalescer.dispose();
		await h.flush();

		expect(h.keys()).toEqual([]);
	});
});
