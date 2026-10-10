import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { appendRowOnce, formatRow } from '../../scripts/lib/advisory-sweep/row.ts';
import { matchFile, scanRoot } from '../../scripts/lib/advisory-sweep/scan.ts';
import { runSweep } from '../../scripts/advisory-sweep.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../backend/_helpers/remove-temp-tree.ts';

// The digest's advisory row was produced by an agent-written sweeper that walked node_modules on
// Windows (19,733 files instead of 613) and reported two third-party packages' own devDependencies
// as hits, then appended a row on each of its three reruns (Carl, #7405, 2026-10-08).

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => removeTempTree(root)));
});

async function fleet(): Promise<string> {
	const root = await testTempDir('aidd-advisory-sweep-');
	roots.push(root);
	const app = join(root, 'app');
	await mkdir(join(app, 'node_modules', 'swr'), { recursive: true });
	await mkdir(join(app, 'frontend'), { recursive: true });
	await writeFile(
		join(app, 'package.json'),
		JSON.stringify({
			dependencies: { 'next-auth': '1.0.0' },
			devDependencies: { ghost: '5.0.0' },
		}),
	);
	await writeFile(
		join(app, 'node_modules', 'swr', 'package.json'),
		JSON.stringify({ devDependencies: { next: '15.0.4' } }),
	);
	await writeFile(
		join(app, 'bun.lock'),
		[
			'{',
			'  "packages": {',
			'    "ghost": ["ghost@5.0.0", "", {}, "sha512-x"],',
			'    "@ianvs/prettier-plugin-sort-imports": ["@ianvs/prettier-plugin-sort-imports@4.0.0", "", {}, "sha512-y"],',
			'    "nextish": ["nextish@1.0.0", "", {}, "sha512-z"],',
			'  }',
			'}',
		].join('\n'),
	);
	await writeFile(
		join(app, 'frontend', 'package-lock.json'),
		JSON.stringify({
			packages: {
				'node_modules/payload': { version: '3.1.0' },
				'node_modules/x/node_modules/payload': { version: '2.9.0' },
			},
		}),
	);
	return root;
}

describe('advisory sweep scan', () => {
	test('reads manifests and lockfiles, never node_modules', async () => {
		const root = await fleet();
		const scan = await scanRoot(root);
		expect(scan.readable).toBe(true);
		expect(scan.files.map((file) => file.slice(root.length + 1))).toEqual([
			join('app', 'bun.lock'),
			join('app', 'frontend', 'package-lock.json'),
			join('app', 'package.json'),
		]);
	});

	test('a package matches a dependency key or lockfile entry, never a substring', async () => {
		const root = await fleet();
		const names = ['next', 'ghost', 'payload'];
		const hits = [];
		for (const file of (await scanRoot(root)).files)
			hits.push(...(await matchFile(file, names)).hits);
		expect(hits.map((hit) => `${hit.name}@${hit.version}`).sort()).toEqual([
			'ghost@5.0.0',
			'ghost@5.0.0',
			'payload@2.9.0',
			'payload@3.1.0',
		]);
		// `next-auth` and `nextish` carry the name as a substring and must not count as `next`.
		expect(hits.some((hit) => hit.name === 'next')).toBe(false);
	});

	test('an unlistable subtree is UNSWEPT and an unlistable root is not "no npm surface"', async () => {
		const root = await fleet();
		const failing = join(root, 'app', 'frontend');
		const scan = await scanRoot(root, 6, async (dir) => {
			if (dir === failing) throw new Error('EACCES');
			const { readdir } = await import('node:fs/promises');
			return readdir(dir, { withFileTypes: true });
		});
		expect(scan.unreadable).toEqual([failing]);
		const missing = await scanRoot(join(root, 'absent'));
		expect(missing.readable).toBe(false);
		expect(missing.files).toEqual([]);
	});
});

describe('advisory sweep coverage', () => {
	// Roger (#7418): a read or parse failure returned no matches while the file still counted as
	// read, so a malformed manifest beside a found control printed "2 files | hits: none" with no
	// sign that half the population was never seen.
	test('a file that cannot be read or parsed is reported, not counted as covered', async () => {
		const root = await fleet();
		await writeFile(join(root, 'app', 'frontend', 'package-lock.json'), '{ not json');
		const result = await runSweep({
			control: '@ianvs/prettier-plugin-sort-imports',
			date: '2026-10-08',
			packages: ['payload'],
			query: 'q',
			roots: [root],
			toolCheck: 'did not apply',
		});
		const row = formatRow(result);
		const broken = join(root, 'app', 'frontend', 'package-lock.json');
		expect(row).toContain(`roots: ${root} 2 files (1 unreadable: ${broken} (unparsable JSON))`);
		expect(row).toContain('| hits: none |');
		const denied = await matchFile(join(root, 'app', 'package.json'), ['ghost'], async () => {
			throw new Error('EACCES');
		});
		expect(denied).toEqual({ failure: 'unreadable: EACCES', hits: [] });
	});

	test('a root whose every file failed is UNSWEPT, and a sweep covering nothing is FAILED', async () => {
		const root = await testTempDir('aidd-advisory-sweep-broken-');
		roots.push(root);
		await writeFile(join(root, 'package.json'), '{ not json');
		const result = await runSweep({
			control: 'x',
			date: '2026-10-08',
			packages: [],
			query: 'q',
			roots: [root],
			toolCheck: 'did not apply',
		});
		expect(result.roots[0]?.failed).toHaveLength(1);
		expect(formatRow(result)).toBe('2026-10-08 | FAILED: 0 files scanned');
	});
});

describe('advisory sweep row', () => {
	test('the row names every root, the control and the hits in the directive format', async () => {
		const root = await fleet();
		const result = await runSweep({
			control: '@ianvs/prettier-plugin-sort-imports',
			date: '2026-10-08',
			packages: ['next', 'ghost'],
			query: 'returned 93 reviewed npm advisories for W',
			roots: [root, join(root, 'absent')],
			toolCheck: 'did not apply',
		});
		const row = formatRow(result);
		expect(
			row.startsWith(
				'2026-10-08 | advisory query: returned 93 reviewed npm advisories for W | roots: ',
			),
		).toBe(true);
		expect(row).toContain(
			`${root} 3 files + ${join(root, 'absent')} UNSWEPT (root not readable)`,
		);
		expect(row).toContain('| packages checked: ghost, next |');
		expect(row).toContain(
			`| hits: ${join(root, 'app', 'bun.lock')}:ghost@5.0.0, ${join(root, 'app', 'package.json')}:ghost@5.0.0 |`,
		);
		expect(row).toContain(
			`| control: @ianvs/prettier-plugin-sort-imports found in ${join(root, 'app', 'bun.lock')} |`,
		);
		expect(row.endsWith('| tool check: did not apply')).toBe(true);
	});

	test('a sweep that read nothing is the FAILED form, and a missing control is named', async () => {
		const root = await testTempDir('aidd-advisory-sweep-empty-');
		roots.push(root);
		const empty = await runSweep({
			control: 'x',
			date: '2026-10-08',
			packages: [],
			query: 'q',
			roots: [root],
			toolCheck: 'did not apply',
		});
		expect(formatRow(empty)).toBe('2026-10-08 | FAILED: 0 files scanned');
		const filled = await fleet();
		const noControl = await runSweep({
			control: 'not-installed-anywhere',
			date: '2026-10-08',
			packages: [],
			query: 'q',
			roots: [filled],
			toolCheck: 'did not apply',
		});
		expect(formatRow(noControl)).toContain(
			'| packages checked: (none named) | hits: none | control: not-installed-anywhere NOT FOUND |',
		);
	});

	test('a rerun on the same day with the same query appends nothing', async () => {
		const root = await testTempDir('aidd-advisory-sweep-append-');
		roots.push(root);
		const file = join(root, 'advisory-sweeps.md');
		await writeFile(file, '# header\n2026-10-07 | advisory query: old | roots: r | hits: none');
		const row =
			'2026-10-08 | advisory query: q | roots: r 3 files | packages checked: (none named) | hits: none | control: c found in f | tool check: did not apply';
		expect(await appendRowOnce(file, row)).toEqual({ written: true });
		const corrected = row.replace('hits: none', 'hits: still none');
		expect(await appendRowOnce(file, corrected)).toEqual({ existing: row, written: false });
		const other = row.replace('query: q', 'query: q2');
		expect(await appendRowOnce(file, other)).toEqual({ written: true });
		const text = await readFile(file, 'utf8');
		expect(text.split('\n').filter((line) => line.startsWith('2026-10-08 |'))).toEqual([
			row,
			other,
		]);
		expect(
			text.startsWith('# header\n2026-10-07 | advisory query: old | roots: r | hits: none\n'),
		).toBe(true);
	});

	// Roger (#7418): twelve concurrent calls with one date and query each appended the row.
	test('concurrent appends of one row record it once', async () => {
		const root = await testTempDir('aidd-advisory-sweep-concurrent-');
		roots.push(root);
		const file = join(root, 'advisory-sweeps.md');
		const row =
			'2026-10-08 | advisory query: q | roots: r 1 files | packages checked: (none named) | hits: none | control: c found in f | tool check: did not apply';
		const outcomes = await Promise.all(
			Array.from({ length: 12 }, () => appendRowOnce(file, row)),
		);
		expect(outcomes.filter((o) => o.written)).toHaveLength(1);
		const text = await readFile(file, 'utf8');
		expect(text.split('\n').filter((line) => line.startsWith('2026-10-08 |'))).toEqual([row]);
		expect(await Bun.file(`${file}.lock`).exists()).toBe(false);
	});
});
