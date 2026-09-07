import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');
const SRC = join(FRONTEND_ROOT, 'src');

function tsxFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...tsxFiles(full));
		else if (entry.name.endsWith('.tsx')) out.push(full);
	}
	return out;
}

/** Every <SortableColumnHeader> element in a file, as {key, indicates} pairs. */
function headers(src: string): { indicates: boolean; key: string }[] {
	const out: { indicates: boolean; key: string }[] = [];
	let at = 0;
	for (;;) {
		const open = src.indexOf('<SortableColumnHeader', at);
		if (open === -1) break;
		const close = src.indexOf('/>', open);
		if (close === -1) break;
		const element = src.slice(open, close);
		at = close + 2;
		const marker = 'sortKey="';
		const keyAt = element.indexOf(marker);
		if (keyAt === -1) continue;
		const from = keyAt + marker.length;
		out.push({
			indicates: !element.includes('indicatesSort={false}'),
			key: element.slice(from, element.indexOf('"', from)),
		});
	}
	return out;
}

/** Renders two headers that share one sort key, the second borrowing it. */
function renderSharedKeyRow(): string {
	const script = [
		"import { createElement as h } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { SortableColumnHeader } from './src/components/shared/SortableColumnHeader.tsx';",
		'const common = { activeDir: `asc`, activeKey: `score`, onSort: () => undefined };',
		'const row = h(`table`, null, h(`thead`, null, h(`tr`, null,',
		'	h(SortableColumnHeader, { ...common, className: ``, indicatesSort: false, key: `a`, label: `Change Potential`, sortKey: `score` }),',
		'	h(SortableColumnHeader, { ...common, className: ``, key: `b`, label: `Score`, sortKey: `score` }),',
		'))); console.log(renderToStaticMarkup(row));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

describe('one sort state produces one active column header', () => {
	test('a header that borrows another column’s key stays quiet', () => {
		const markup = renderSharedKeyRow();

		// Both headers trigger the same sort, and before this the active state was
		// `activeKey === sortKey`, so both reported ascending and both drew the up arrow.
		// Two answers to "what is this table sorted by" is what made the sort read as broken.
		expect(markup.match(/aria-sort="ascending"/gu)).toHaveLength(1);
		expect(markup.match(/aria-sort="none"/gu)).toHaveLength(1);
		expect(markup).toContain('aria-label="Sort by Score (asc)"');
		expect(markup).toContain('aria-label="Sort by Change Potential"');
	});

	test('every shared sort key in the app has exactly one indicating header', () => {
		const shared: Record<string, { indicating: number; total: number }> = {};
		for (const file of tsxFiles(SRC)) {
			const rel = relative(SRC, file).split('\\').join('/');
			const found = headers(readFileSync(file, 'utf8'));
			for (const key of new Set(found.map((entry) => entry.key))) {
				const group = found.filter((entry) => entry.key === key);
				if (group.length < 2) continue;
				shared[`${rel}:${key}`] = {
					indicating: group.filter((entry) => entry.indicates).length,
					total: group.length,
				};
			}
		}

		// A census rather than a spot check on audits-catalog: the defect is created by adding a
		// second header for an existing key, which is exactly the edit that would not think to
		// look at this file. Today there is one such pair in the app.
		expect(shared).toEqual({
			'pages/audits/tabs/CatalogTable.tsx:score': { indicating: 1, total: 2 },
		});
	});
});
