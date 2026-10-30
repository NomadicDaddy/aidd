import { afterEach, describe, expect, test } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { FetchFn } from '../../scripts/lib/news-digest/fetch.ts';

import { advisoryQuery } from '../../scripts/lib/news-digest/advisories.ts';
import { previousAdvisoriesEnd, recordAdvisoriesEnd } from '../../scripts/lib/news-digest/state.ts';
import { runDigestCommand } from '../../scripts/news-digest.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../backend/_helpers/remove-temp-tree.ts';

// Each daily run used to compute its own "24 hours before now", so consecutive windows left gaps:
// 2026-10-28's ended at 13:33:13Z and 2026-10-29's began at 13:33:18Z (Roger 83e038c3, Carl
// 29341544). `--start previous` starts at the end the last complete run recorded instead.

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => removeTempTree(root)));
});

const FIRST_END = '2026-10-28T13:33:13Z';
const SECOND_END = '2026-10-29T13:33:18Z';

/** Answers each advisories query with an empty page, and records which queries were asked. */
function emptyAdvisories(asked: string[], fail = false): FetchFn {
	return (url) => {
		asked.push(url);
		const status = fail ? 503 : 200;
		return Promise.resolve(new Response(fail ? 'unavailable' : '[]', { status }));
	};
}

async function digestDir(): Promise<string> {
	const dir = await testTempDir('news-digest-window-');
	roots.push(dir);
	return dir;
}

async function recorded(dir: string): Promise<unknown> {
	const state = JSON.parse(await readFile(join(dir, 'last-digest.json'), 'utf8')) as {
		advisoriesThrough?: string;
	};
	return state.advisoriesThrough;
}

describe('the advisories window chains from the previous run', () => {
	test('starts where the last complete run ended, so no second falls between windows', async () => {
		const dir = await digestDir();
		const asked: string[] = [];
		const lines: string[] = [];
		const print = (line: string): void => void lines.push(line);
		const first = { dir, end: FIRST_END, start: '2026-10-27T13:33:13Z' };
		expect(await runDigestCommand(['advisories'], first, emptyAdvisories(asked), print)).toBe(
			0,
		);
		expect(await recorded(dir)).toBe(FIRST_END);

		const second = { dir, end: SECOND_END, start: 'previous' };
		expect(await runDigestCommand(['advisories'], second, emptyAdvisories(asked), print)).toBe(
			0,
		);
		expect(asked[1]).toBe(advisoryQuery(FIRST_END, SECOND_END));
		expect(lines).toContain(`# window starts at the previous run's recorded end: ${FIRST_END}`);
		expect(await recorded(dir)).toBe(SECOND_END);
	});

	test('refuses previous when no run has recorded an end, rather than guessing a window', async () => {
		const dir = await digestDir();
		const options = { dir, end: SECOND_END, start: 'previous' };
		await expect(
			runDigestCommand(['advisories'], options, emptyAdvisories([]), () => undefined),
		).rejects.toThrow('No advisories window is recorded yet');
	});

	test('a failed query leaves the mark where it was, so the next run asks for that window again', async () => {
		const dir = await digestDir();
		const ok = { dir, end: FIRST_END, start: '2026-10-27T13:33:13Z' };
		await runDigestCommand(['advisories'], ok, emptyAdvisories([]), () => undefined);
		const failing = { dir, end: SECOND_END, start: 'previous' };
		await expect(
			runDigestCommand(['advisories'], failing, emptyAdvisories([], true), () => undefined),
		).rejects.toThrow('HTTP 503');
		expect(await recorded(dir)).toBe(FIRST_END);
	});

	test('the mark never moves back, and a time that is not one is refused', () => {
		const state = { advisoriesThrough: SECOND_END, items: [] };
		expect(recordAdvisoriesEnd(state, FIRST_END, FIRST_END)).toBe(state);
		const seeded = recordAdvisoriesEnd({ items: [] }, '2026-10-27T13:33:13Z', FIRST_END);
		expect(previousAdvisoriesEnd(seeded)).toBe(FIRST_END);
		expect(() => recordAdvisoriesEnd(state, SECOND_END, 'yesterday')).toThrow(
			'Expected an ISO time',
		);
	});

	// Morticia L-1 on eeef797e: a window starting after the mark would carry it past unlisted time.
	test('a window that starts after the mark leaves the mark, so the gap is still asked for', async () => {
		const dir = await digestDir();
		const seed = { dir, end: FIRST_END, start: '2026-10-27T13:33:13Z' };
		await runDigestCommand(['advisories'], seed, emptyAdvisories([]), () => undefined);
		const lines: string[] = [];
		const later = { dir, end: '2026-10-30T13:00:00Z', start: '2026-10-29T13:00:00Z' };
		expect(
			await runDigestCommand(['advisories'], later, emptyAdvisories([]), (line) => {
				lines.push(line);
			}),
		).toBe(0);
		expect(lines).toContain(`# recorded end unchanged: ${FIRST_END}`);
		expect(await recorded(dir)).toBe(FIRST_END);

		const joining = { dir, end: SECOND_END, start: '2026-10-28T00:00:00Z' };
		await runDigestCommand(['advisories'], joining, emptyAdvisories([]), () => undefined);
		expect(await recorded(dir)).toBe(SECOND_END);
	});

	// Morticia I-1 on eeef797e: items added while the query ran are kept.
	test('an item recorded during the query survives the mark being written', async () => {
		const dir = await digestDir();
		const seed = { dir, end: FIRST_END, start: '2026-10-27T13:33:13Z' };
		await runDigestCommand(['advisories'], seed, emptyAdvisories([]), () => undefined);
		const path = join(dir, 'last-digest.json');
		const addDuringQuery: FetchFn = async () => {
			const state = JSON.parse(await readFile(path, 'utf8')) as { items: unknown[] };
			state.items.push({ firstReported: '2026-10-29', title: 'Added', url: 'https://added' });
			await writeFile(path, JSON.stringify(state));
			return new Response('[]');
		};
		const next = { dir, end: SECOND_END, start: 'previous' };
		await runDigestCommand(['advisories'], next, addDuringQuery, () => undefined);
		const after = JSON.parse(await readFile(path, 'utf8')) as {
			advisoriesThrough: string;
			items: { url: string }[];
		};
		expect(after.advisoriesThrough).toBe(SECOND_END);
		expect(after.items.map((item) => item.url)).toEqual(['https://added']);
	});
});
