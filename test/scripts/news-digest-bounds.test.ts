import { afterEach, describe, expect, test } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { boundedFetch, htmlToText } from '../../scripts/lib/news-digest/fetch.ts';
import { writeState } from '../../scripts/lib/news-digest/state.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../backend/_helpers/remove-temp-tree.ts';

// Morticia's review of 526a9ec8 (#18568): an entity beyond Unicode threw, a stalled or runaway
// host could hang the scheduled digest, and a kill mid-write left state no later run could parse.

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => removeTempTree(root)));
});

describe('news digest bounds', () => {
	test('keeps a numeric entity beyond Unicode as written instead of throwing', () => {
		expect(htmlToText('<p>A &#65; &#1114112; B</p>', 100)).toBe('A A &#1114112; B');
	});

	test('refuses a body larger than the cap', async () => {
		const inner = (): Promise<Response> => Promise.resolve(new Response('x'.repeat(11)));
		const fetchFn = boundedFetch(inner, 1_000, 10);
		await expect(fetchFn('https://big.example/')).rejects.toThrow('larger than 10 bytes');
	});

	test('passes a body within the cap through with its status and headers', async () => {
		const inner = (): Promise<Response> =>
			Promise.resolve(
				new Response('{"a":1}', { headers: { link: '<next>; rel="next"' }, status: 200 }),
			);
		const response = await boundedFetch(inner, 1_000, 10)('https://ok.example/');
		expect(response.status).toBe(200);
		expect(response.headers.get('link')).toBe('<next>; rel="next"');
		expect(await response.json()).toEqual({ a: 1 });
	});

	test('gives up on a host that never answers', async () => {
		const inner = (_url: string, init?: RequestInit): Promise<Response> =>
			new Promise((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
			});
		await expect(boundedFetch(inner, 50, 10)('https://stalled.example/')).rejects.toThrow(
			'aborted',
		);
	});

	test('writes state through a temp file and leaves no temp file behind', async () => {
		const dir = await testTempDir('aidd-digest-state-');
		roots.push(dir);
		const path = join(dir, 'last-digest.json');
		await writeState(path, { items: [{ firstReported: '2026-10-21', title: 'T', url: 'u' }] });
		expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
			items: [{ firstReported: '2026-10-21', title: 'T', url: 'u' }],
		});
		expect(await readdir(dir)).toEqual(['last-digest.json']);
	});
});
