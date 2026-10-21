import { afterEach, describe, expect, test } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { FetchFn } from '../../scripts/lib/news-digest/fetch.ts';

import { advisoryQuery, fetchAdvisories } from '../../scripts/lib/news-digest/advisories.ts';
import { htmlToText, nextLink, parseFeed } from '../../scripts/lib/news-digest/fetch.ts';
import { fetchStackReleases } from '../../scripts/lib/news-digest/releases.ts';
import { addItems, knownBefore } from '../../scripts/lib/news-digest/state.ts';
import { validateDigest } from '../../scripts/lib/news-digest/validate.ts';
import { runDigestCommand } from '../../scripts/news-digest.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../backend/_helpers/remove-temp-tree.ts';

// The daily digest's agent rewrote these tools into .news-digest on most runs since 2026-10-03,
// including a state updater and a validator with that day's items and count typed into them
// (Phillip #17709). These pin the committed versions it now calls instead.

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => removeTempTree(root)));
});

function routes(table: Record<string, { body: unknown; link?: string; status?: number }>): FetchFn {
	return (url) => {
		const hit = table[url];
		if (!hit) return Promise.resolve(new Response('not found', { status: 404 }));
		const body = typeof hit.body === 'string' ? hit.body : JSON.stringify(hit.body);
		const init: ResponseInit = { status: hit.status ?? 200 };
		if (hit.link) init.headers = { link: hit.link };
		return Promise.resolve(new Response(body, init));
	};
}

const advisory = (id: string, name: string) => ({
	ghsa_id: id,
	html_url: `https://github.com/advisories/${id}`,
	severity: 'high',
	vulnerabilities: [{ package: { name } }, { package: { name } }],
});

describe('news digest advisories', () => {
	test('puts the window in the query and follows every page', async () => {
		const first = advisoryQuery('2026-10-20T13:33:00Z', '2026-10-21T13:33:00Z');
		expect(first).toContain('published=2026-10-20T13%3A33%3A00Z..2026-10-21T13%3A33%3A00Z');
		const second = 'https://api.github.com/advisories?page=2';
		const result = await fetchAdvisories(
			'2026-10-20T13:33:00Z',
			'2026-10-21T13:33:00Z',
			routes({
				[first]: { body: [advisory('GHSA-a', 'vite')], link: `<${second}>; rel="next"` },
				[second]: { body: [advisory('GHSA-b', 'sharp')] },
			}),
			{},
		);
		expect(result.pages).toBe(2);
		expect(result.returned).toBe(2);
		expect(result.lines.map((line) => line.ghsaId)).toEqual(['GHSA-a', 'GHSA-b']);
		expect(result.lines[0]?.packages).toEqual(['vite']);
	});

	test('a failed page is an error, not an empty list', async () => {
		const query = advisoryQuery('a', 'b');
		const failing = routes({ [query]: { body: 'rate limited', status: 403 } });
		await expect(fetchAdvisories('a', 'b', failing, {})).rejects.toThrow('HTTP 403');
	});

	test('nextLink reads only rel="next"', () => {
		expect(nextLink('<https://x/2>; rel="next", <https://x/9>; rel="last"')).toBe(
			'https://x/2',
		);
		expect(nextLink('<https://x/1>; rel="prev"')).toBeNull();
		expect(nextLink(null)).toBeNull();
	});
});

describe('news digest releases', () => {
	test('keeps releases inside the window and reports a failing repo', async () => {
		const fetchFn = routes({
			'https://api.github.com/repos/oven-sh/bun/releases?per_page=100': {
				body: [
					{ published_at: '2026-10-21T10:00:00Z', tag_name: 'bun-v1.4.4' },
					{ published_at: '2026-10-01T10:00:00Z', tag_name: 'bun-v1.4.3' },
				],
			},
		});
		const [bun, node] = await fetchStackReleases(
			'2026-10-20T13:33:00Z',
			'2026-10-21T13:33:00Z',
			fetchFn,
			{},
			['oven-sh/bun', 'nodejs/node'],
		);
		expect(bun?.inWindow.map((release) => release.tag)).toEqual(['bun-v1.4.4']);
		expect(bun?.latestStable?.tag).toBe('bun-v1.4.4');
		expect(node?.error).toBe('HTTP 404');
	});

	// Roger on 526a9ec8: one page of 15 dropped releases behind it in a wide window or busy repo.
	const BUN = 'https://api.github.com/repos/oven-sh/bun/releases?per_page=100';
	const release = (day: string, tag: string) => ({
		published_at: `${day}T10:00:00Z`,
		tag_name: tag,
	});

	test('follows every page, even past an old release, to the last one', async () => {
		// Page one already holds a release older than the window. A reader that stopped there
		// would miss v2 on page two, which was published inside the window.
		const fetchFn = routes({
			[BUN]: {
				body: [release('2026-10-21', 'v3'), release('2026-09-01', 'v1')],
				link: `<${BUN}&page=2>; rel="next"`,
			},
			[`${BUN}&page=2`]: { body: [release('2026-10-15', 'v2')] },
		});
		const [bun] = await fetchStackReleases(
			'2026-10-10T00:00:00Z',
			'2026-10-22T00:00:00Z',
			fetchFn,
			{},
			['oven-sh/bun'],
		);
		expect(bun?.error).toBeUndefined();
		expect(bun?.inWindow.map((r) => r.tag)).toEqual(['v3', 'v2']);
	});

	test('reports an error rather than a short list when the pages never end', async () => {
		const endless: FetchFn = (url) =>
			Promise.resolve(
				new Response(JSON.stringify([release('2026-10-21', url)]), {
					headers: { link: `<${url}x>; rel="next"` },
				}),
			);
		const [bun] = await fetchStackReleases(
			'2026-10-01T00:00:00Z',
			'2026-10-22T00:00:00Z',
			endless,
			{},
			['oven-sh/bun'],
		);
		expect(bun?.error).toBe('more than 20 pages of releases');
		expect(bun?.inWindow).toEqual([]);
	});
});

describe('news digest pages', () => {
	test('parses RSS items and Atom entries', () => {
		const rss = `<rss><channel><title>Feed</title><item><title><![CDATA[A &amp; B]]></title>
			<link>https://a.example/1</link><pubDate>Tue, 21 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
		const atom = `<feed><entry><title>C</title><link href="https://c.example/2"/>
			<published>2026-10-21T09:00:00Z</published></entry></feed>`;
		expect(parseFeed(rss, 10)).toEqual([
			{ date: 'Tue, 21 Oct 2026 10:00:00 GMT', link: 'https://a.example/1', title: 'A & B' },
		]);
		expect(parseFeed(atom, 10)[0]).toEqual({
			date: '2026-10-21T09:00:00Z',
			link: 'https://c.example/2',
			title: 'C',
		});
	});

	test('reduces a page to readable text', () => {
		const html = '<html><script>x()</script><p>One &quot;two&quot;</p><p>Three</p></html>';
		expect(htmlToText(html, 100)).toBe('One "two"\nThree');
	});
});

describe('news digest state', () => {
	const state = {
		items: [
			{ firstReported: '2026-10-10', title: 'Old', url: 'https://old' },
			{ firstReported: '2026-10-20', title: 'Yesterday', url: 'https://y' },
			{ firstReported: '2026-10-21', title: 'Earlier today', url: 'https://t' },
		],
	};

	test('known lists only items first reported on an earlier day', () => {
		expect(knownBefore(state, '2026-10-21').map((item) => item.url)).toEqual([
			'https://old',
			'https://y',
		]);
	});

	test('add records each new item once and prunes beyond seven days', () => {
		const result = addItems(state, '2026-10-21', [
			{ title: 'New', url: 'https://n' },
			{ title: 'New again', url: 'https://n' },
			{ title: 'Earlier today', url: 'https://t' },
		]);
		expect(result.added).toBe(1);
		expect(result.alreadyRecorded).toBe(2);
		expect(result.pruned).toBe(1);
		expect(result.state.items.map((item) => item.url)).toEqual([
			'https://y',
			'https://t',
			'https://n',
		]);
	});
});

const digest = (listed: number, stated: number, row: string): string =>
	[
		'# Daily news digest',
		'## Security advisories (npm)',
		`The database returned **${stated}** reviewed npm advisories.`,
		...Array.from({ length: listed }, (_, i) => `- pkg — high — GHSA-${i} — https://x/${i}`),
		'## Advisory lockfile check',
		row,
	].join('\n');

describe('news digest validate', () => {
	test('passes when counts match and the sweep row is there', () => {
		expect(
			validateDigest(digest(2, 2, '2026-10-21 | advisory query: …'), '2026-10-21'),
		).toEqual([]);
	});

	test('names a count mismatch and a missing row', () => {
		expect(validateDigest(digest(1, 2, 'no row'), '2026-10-21')).toEqual([
			'advisory section states 2 returned but lists 1 GHSA lines',
			'lockfile check has no sweep row starting "2026-10-21 | "',
		]);
	});

	test('the command reads the day file and records state in the digest folder', async () => {
		const dir = await testTempDir('aidd-news-digest-');
		roots.push(dir);
		await writeFile(
			join(dir, '20261021.md'),
			digest(0, 0, '2026-10-21 | advisory query: none'),
		);
		await writeFile(
			join(dir, 'items.json'),
			JSON.stringify([{ title: 'T', url: 'https://t' }]),
		);
		const out: string[] = [];
		const print = (line: string): void => void out.push(line);
		expect(
			await runDigestCommand(['validate'], { date: '2026-10-21', dir }, fetch, print),
		).toBe(0);
		const add = { date: '2026-10-21', dir, file: join(dir, 'items.json') };
		expect(await runDigestCommand(['state', 'add'], add, fetch, print)).toBe(0);
		const saved = JSON.parse(await readFile(join(dir, 'last-digest.json'), 'utf8')) as {
			items: { firstReported: string }[];
		};
		expect(saved.items).toHaveLength(1);
		expect(saved.items[0]?.firstReported).toBe('2026-10-21');
		expect(out).toContain('added 1, already recorded 0, pruned 0');
	});
});
