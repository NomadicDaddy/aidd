import { describe, expect, test } from 'bun:test';

import { getCliStatus, getSourceControlStatus } from '../../frontend/src/api/settings.ts';
import { createToolStatusGate } from '../../frontend/src/hooks/toolStatusRefresh.ts';

type FetchFn = (input: Request | string | URL, init?: RequestInit) => Promise<Response>;

function withFetch<T>(fn: FetchFn, run: () => Promise<T>): Promise<T> {
	const original = globalThis.fetch;
	globalThis.fetch = fn as typeof fetch;
	return run().finally(() => {
		globalThis.fetch = original;
	});
}

function recordingGate() {
	const seen: (boolean | undefined)[] = [];
	const gate = createToolStatusGate(async (refresh) => {
		seen.push(refresh);
		return await Promise.resolve('probed');
	});
	return { gate, seen };
}

describe('tool status refresh gate', () => {
	test('reuses the cached probe until a refresh is explicitly requested', async () => {
		const { gate, seen } = recordingGate();

		await gate.run();
		gate.requestRefresh();
		await gate.run();
		await gate.run();

		// Only the fetch that follows the Refresh click pays for a re-probe; the flag is
		// one-shot, so the next ordinary load is served from the backend cache again.
		expect(seen).toEqual([false, true, false]);
	});

	test('ignores the context object react-query hands a queryFn', async () => {
		const { gate, seen } = recordingGate();

		// Regression guard for the whole point of the cache: a fetcher wired straight into
		// `queryFn` receives react-query's context positionally, and that object as `refresh`
		// is truthy — every ordinary load would force a re-probe and nothing would be cached.
		await (gate.run as unknown as (context: unknown) => Promise<string>)({
			queryKey: ['settings-cli-status'],
			signal: new AbortController().signal,
		});

		expect(seen).toEqual([false]);
	});

	test('collapses repeated refresh clicks into one re-probe', async () => {
		const { gate, seen } = recordingGate();

		gate.requestRefresh();
		gate.requestRefresh();
		await gate.run();
		await gate.run();

		expect(seen).toEqual([true, false]);
	});
});

describe('settings status API refresh flag', () => {
	test('asks the backend to re-probe only when refresh is requested', async () => {
		const urls: string[] = [];
		const respond: FetchFn = async (input) => {
			urls.push(typeof input === 'string' ? input : input.toString());
			return await Promise.resolve(
				new Response(JSON.stringify({ backends: [], providers: [] }), {
					headers: { 'content-type': 'application/json' },
				})
			);
		};

		await withFetch(respond, async () => {
			await getCliStatus();
			await getCliStatus(true);
			await getSourceControlStatus();
			await getSourceControlStatus(true);
		});

		expect(urls).toEqual([
			'/api/v1/settings/cli-status',
			'/api/v1/settings/cli-status?refresh=true',
			'/api/v1/settings/source-control-status',
			'/api/v1/settings/source-control-status?refresh=true',
		]);
	});
});
