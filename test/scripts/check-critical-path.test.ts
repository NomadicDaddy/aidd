import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { describe, expect, test } from 'bun:test';

import { runCriticalPath } from '../../scripts/check-critical-path.ts';
import {
	findEntryChunk,
	parseCriticalAssets,
	sizeOf,
	staticImportsOf,
} from '../../scripts/lib/critical-path/assets.ts';
import {
	budgetFailures,
	CRITICAL_PATH_GZIP_CEILING,
	DEFAULT_BUDGET_PATH,
	nextBudget,
} from '../../scripts/lib/critical-path/budget.ts';
import { testTempDirSync } from '../_helpers/temp.ts';

/** The string react.production.js builds for element types; how the gate locates the runtime. */
const REACT_MARKER = 'react.transitional.element useState Minified React error';

/**
 * A synthetic build. `assets` maps file name to contents; `html` is index.html verbatim, so each
 * test states exactly which assets the browser is told to fetch before first render.
 */
function buildDist(assets: Record<string, string>, html: string): string {
	const dir = testTempDirSync('critical-path-');
	mkdirSync(join(dir, 'assets'), { recursive: true });
	for (const [name, body] of Object.entries(assets)) {
		writeFileSync(join(dir, 'assets', name), body);
	}
	writeFileSync(join(dir, 'index.html'), html);
	return dir;
}

function writeBudget(dir: string, gzipBytes: number, brotliBytes: number): string {
	const path = join(dir, 'budget.json');
	writeFileSync(
		path,
		JSON.stringify({
			maxCriticalPathBrotliBytes: brotliBytes,
			maxCriticalPathGzipBytes: gzipBytes,
		}),
	);
	return path;
}

/** The gate reports through console.log; the verdict under test is its exit code. */
function runQuiet(options: Parameters<typeof runCriticalPath>[0]): number {
	const original = console.log;
	console.log = () => {};
	try {
		return runCriticalPath(options);
	} finally {
		console.log = original;
	}
}

describe('critical-path HTML discovery', () => {
	test('finds blocking assets regardless of attribute or tag casing', () => {
		const html = `
			<SCRIPT src="/assets/entry.js" TYPE="module"></SCRIPT>
			<link href="/assets/runtime.js" rel="modulepreload">
			<link rel="stylesheet" href="/assets/app.css">
			<link rel="prefetch" href="/assets/lazy.js">
		`;

		expect(parseCriticalAssets(html)).toEqual(['entry.js', 'runtime.js', 'app.css']);
	});

	test('deduplicates assets and excludes non-blocking links', () => {
		const html = `
			<script type="module" src="/assets/entry.js"></script>
			<link rel="modulepreload" href="/assets/entry.js">
			<link rel="preload" href="/assets/font.woff2">
			<script src="/assets/classic.js"></script>
		`;

		expect(parseCriticalAssets(html)).toEqual(['entry.js']);
	});

	test('identifies the module entry without assuming attribute order', () => {
		expect(findEntryChunk('<script src="/assets/entry.js" defer type="module"></script>')).toBe(
			'entry.js',
		);
		expect(findEntryChunk('<script src="/assets/classic.js"></script>')).toBeNull();
	});

	test('counts side-effect imports, not just binding imports', () => {
		const dir = buildDist(
			{ 'entry.js': 'import"./side.js";import{a}from"./bound.js";import("./lazy.js")' },
			'<script type="module" src="/assets/entry.js"></script>',
		);

		// A side-effect import is exactly as serialized as a binding import, and `import()` is
		// lazy by definition — matching only `from"..."` under-reports the waterfall.
		expect(staticImportsOf('entry.js', dir).sort()).toEqual(['bound.js', 'side.js']);
	});
});

describe('critical-path budget arithmetic', () => {
	test('a build within its brotli ratchet still fails on the gzip ceiling', () => {
		// The finding this gate was rewritten for: brotli is ~7% denser on this bundle, so a
		// brotli-only budget reported green while the wire cost was 32% over the gzip ceiling.
		const failures = budgetFailures(
			{ brotliBytes: 200_000, gzipBytes: 231_410 },
			{ maxCriticalPathBrotliBytes: 224_922, maxCriticalPathGzipBytes: 174_080 },
		);

		expect(failures).toHaveLength(1);
		expect(failures[0]).toContain('ceiling');
	});

	test('regenerating the brotli ratchet never raises the gzip ceiling', () => {
		const regenerated = nextBudget(
			{ brotliBytes: 400_000, gzipBytes: 500_000 },
			{ maxCriticalPathBrotliBytes: 1, maxCriticalPathGzipBytes: CRITICAL_PATH_GZIP_CEILING },
		);

		expect(regenerated.maxCriticalPathGzipBytes).toBe(CRITICAL_PATH_GZIP_CEILING);
		expect(regenerated.maxCriticalPathBrotliBytes).toBeGreaterThan(400_000);
	});

	test('the committed budget states the 170 KB ceiling', () => {
		const committed = JSON.parse(readFileSync(DEFAULT_BUDGET_PATH, 'utf-8')) as {
			maxCriticalPathGzipBytes: number;
		};

		expect(CRITICAL_PATH_GZIP_CEILING).toBe(174_080);
		expect(committed.maxCriticalPathGzipBytes).toBe(CRITICAL_PATH_GZIP_CEILING);
	});

	test('gzip is measured at the level backend/src/staticAssets.ts serves', () => {
		const body = `const x=${JSON.stringify('a'.repeat(4096))};export default x;`;
		const dir = buildDist({ 'entry.js': body }, '');

		// Not raw bytes and not brotli: the ceiling is a claim about what gzip clients receive.
		expect(sizeOf('entry.js', dir).gzipBytes).toBe(gzipSync(body, { level: 6 }).length);
	});
});

describe('critical-path gate verdicts', () => {
	const passingHtml = [
		'<script type="module" src="/assets/entry.js"></script>',
		'<link rel="modulepreload" href="/assets/react.js">',
		'<link rel="stylesheet" href="/assets/app.css">',
	].join('\n');

	function passingAssets(): Record<string, string> {
		return {
			'app.css': 'body{color:red}',
			'entry.js': 'import{r}from"./react.js";r()',
			'react.js': `export const r=()=>"${REACT_MARKER}"`,
		};
	}

	test('passes a build that is under budget, preloads React, and has no waterfall', () => {
		const dir = buildDist(passingAssets(), passingHtml);

		expect(
			runQuiet({
				budgetPath: writeBudget(dir, 100_000, 100_000),
				distDir: dir,
				updateBudget: false,
			}),
		).toBe(0);
	});

	test('fails when the critical path exceeds the gzip ceiling', () => {
		const assets = passingAssets();
		assets['entry.js'] += `\n//${'payload '.repeat(20_000)}`;
		const dir = buildDist(assets, passingHtml);

		// Brotli is left deliberately generous so only the gzip ceiling can produce this failure.
		expect(
			runQuiet({
				budgetPath: writeBudget(dir, 1_000, 10_000_000),
				distDir: dir,
				updateBudget: false,
			}),
		).toBe(1);
	});

	test('fails when the React runtime is not preloaded', () => {
		const assets = passingAssets();
		// React moved into a chunk index.html never mentions: same bytes, one more round trip.
		assets['late.js'] = assets['react.js'] ?? '';
		assets['react.js'] = 'export const r=()=>1';
		const dir = buildDist(assets, passingHtml);

		expect(
			runQuiet({
				budgetPath: writeBudget(dir, 100_000, 100_000),
				distDir: dir,
				updateBudget: false,
			}),
		).toBe(1);
	});

	test('a preloaded runtime cannot conceal another runtime in a lazy chunk', () => {
		const assets = passingAssets();
		assets['late.js'] = `export const late="${REACT_MARKER}"`;
		const dir = buildDist(assets, passingHtml);
		expect(
			runQuiet({
				budgetPath: writeBudget(dir, 100_000, 100_000),
				distDir: dir,
				updateBudget: false,
			}),
		).toBe(1);
	});

	test('JSX helper markers do not stand in for a missing core and renderer', () => {
		const assets = passingAssets();
		assets['react.js'] = 'export const r=()=>"react.transitional.element react.fragment"';
		const dir = buildDist(assets, passingHtml);
		expect(
			runQuiet({
				budgetPath: writeBudget(dir, 100_000, 100_000),
				distDir: dir,
				updateBudget: false,
			}),
		).toBe(1);
	});

	test('fails when the entry statically imports a chunk that is not preloaded', () => {
		const assets = passingAssets();
		assets['entry.js'] = 'import{r}from"./react.js";import"./unlisted.js";r()';
		assets['unlisted.js'] = 'export const u=1';
		const dir = buildDist(assets, passingHtml);

		expect(
			runQuiet({
				budgetPath: writeBudget(dir, 100_000, 100_000),
				distDir: dir,
				updateBudget: false,
			}),
		).toBe(1);
	});

	test('fails rather than skipping the waterfall check when no entry module is found', () => {
		// A check that did not run must never be reported as one that passed.
		const dir = buildDist(passingAssets(), '<link rel="stylesheet" href="/assets/app.css">');

		expect(
			runQuiet({
				budgetPath: writeBudget(dir, 100_000, 100_000),
				distDir: dir,
				updateBudget: false,
			}),
		).toBe(1);
	});
});
