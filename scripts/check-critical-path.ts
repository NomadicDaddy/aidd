#!/usr/bin/env bun
/**
 * Enforces: WEB-001 -- the bundled web surface stays a lean single-user control plane, measured
 * where leanness is observable: what the browser must fetch before it can render.
 *
 * Guards the bytes and the *shape* of the first page load. A total-size budget is
 * structurally blind to how bytes are distributed: in spernakit, a release that moved
 * the React runtime out of its preloaded chunk and into a lazily-loaded one changed the
 * total by zero bytes while adding a serialized round trip to every page load, and every
 * size budget passed. Total-size budgets cannot see that. These three checks can:
 *
 *   1. BUDGET    — everything the browser must fetch before first render (entry +
 *                  modulepreloads + blocking CSS) stays under a fixed gzip ceiling and
 *                  under the regenerated brotli ratchet. Both encodings are measured at
 *                  the levels backend/src/staticAssets.ts actually serves, because the
 *                  ceiling is a claim about bytes on the wire.
 *   2. RUNTIME   — the React runtime sits in a chunk that index.html preloads, so it
 *                  is never discovered late.
 *   3. WATERFALL — the entry chunk never statically imports a chunk that is not
 *                  preloaded. That combination is the round-trip bug by definition:
 *                  the browser cannot know it needs the chunk until it parses the entry.
 *
 * Regenerate the budget after intentional growth:
 *   bun scripts/check-critical-path.ts --update-budget
 */
import { existsSync, readFileSync } from 'node:fs';
import { exit } from 'node:process';
import { parseArgs } from 'node:util';

import {
	type CriticalAsset,
	DEFAULT_DIST_DIR,
	findEntryChunk,
	findReactRuntimeChunks,
	indexHtmlOf,
	parseCriticalAssets,
	sizeOf,
	staticImportsOf,
} from './lib/critical-path/assets.ts';
import { checkBudget, type CriticalPathTotals } from './lib/critical-path/budget.ts';
import { kb, log } from './lib/critical-path/report.ts';

export interface CriticalPathOptions {
	/** Where the budget file lives. Overridable so this gate's own failures are testable. */
	budgetPath?: string;
	/** The build to measure. Overridable for the same reason. */
	distDir?: string;
	/** True rewrites scripts/critical-path-budget.json from this build instead of checking it. */
	updateBudget: boolean;
}

export function parseCriticalPathArgs(args: string[]): CriticalPathOptions {
	const { values } = parseArgs({
		args,
		options: { 'update-budget': { type: 'boolean' } },
		strict: true,
	});
	return { updateBudget: values['update-budget'] === true };
}

/** Prints the per-asset table and returns the totals the budget is measured against. */
function reportCriticalAssets(assets: CriticalAsset[]): CriticalPathTotals {
	const totals: CriticalPathTotals = {
		brotliBytes: assets.reduce((s, a) => s + a.brotliBytes, 0),
		gzipBytes: assets.reduce((s, a) => s + a.gzipBytes, 0),
	};
	const totalRaw = assets.reduce((s, a) => s + a.rawBytes, 0);

	for (const a of assets) {
		log(
			`${a.name.padEnd(45)} ${kb(a.gzipBytes).padStart(12)} gzip  ${kb(a.brotliBytes).padStart(12)} br  (${kb(a.rawBytes)} raw)`,
		);
	}
	log(
		`\n${String(assets.length).padStart(2)} blocking assets   ${kb(totals.gzipBytes)} gzip  ${kb(totals.brotliBytes)} br  (${kb(totalRaw)} raw)\n`,
		'cyan',
	);
	return totals;
}

/** Check 2: the React runtime must be preloaded, not discovered late. */
function checkRuntimePreloaded(criticalNames: string[], distDir: string): boolean {
	const { react, renderer } = findReactRuntimeChunks(distDir);
	if (react.length === 0 || renderer.length === 0) {
		log(
			'[FAIL] Could not locate both React core and renderer — update the runtime markers.',
			'red',
		);
		return false;
	}
	const runtimeChunks = [...new Set([...react, ...renderer])];
	const late = runtimeChunks.filter((name) => !criticalNames.includes(name));
	if (late.length > 0) {
		log(`[FAIL] React runtime chunks are not preloaded: ${late.join(', ')}.`, 'red');
		log('  It will be discovered only after the entry chunk is parsed, costing a', 'yellow');
		log(
			'  round trip on every page load. This build declares no manual chunking, so',
			'yellow',
		);
		log(
			'  the cause is whatever split react out of the entry — check for a new lazy',
			'yellow',
		);
		log('  import boundary above the React import in frontend/src.', 'yellow');
		return false;
	}
	log(`[OK] React core and renderer are preloaded: ${runtimeChunks.join(', ')}`, 'green');
	return true;
}

/** Check 3: no static import of a chunk the browser was not told to preload. */
function checkWaterfall(entryName: string, criticalNames: string[], distDir: string): boolean {
	const late = staticImportsOf(entryName, distDir).filter((dep) => !criticalNames.includes(dep));
	if (late.length === 0) {
		log('[OK] Entry chunk statically imports only preloaded chunks', 'green');
		return true;
	}
	log(`[FAIL] Entry chunk statically imports ${late.length} non-preloaded chunk(s):`, 'red');
	for (const dep of late) log(`    ${dep}`, 'red');
	log('  A static import that is not preloaded is a serialized round trip: the', 'yellow');
	log('  browser cannot request it until it has parsed the entry chunk.', 'yellow');
	return false;
}

export function runCriticalPath(options: CriticalPathOptions): number {
	log('\n=== Critical-Path Verification ===\n', 'blue');

	const distDir = options.distDir ?? DEFAULT_DIST_DIR;
	const indexHtml = indexHtmlOf(distDir);
	if (!existsSync(indexHtml)) {
		log('[FAIL] frontend/dist/index.html not found — build the frontend first:', 'red');
		log('  bun run build:frontend', 'yellow');
		return 1;
	}

	const html = readFileSync(indexHtml, 'utf-8');
	const criticalNames = parseCriticalAssets(html);
	if (criticalNames.length === 0) {
		log('[FAIL] No entry/modulepreload/stylesheet assets found in index.html', 'red');
		return 1;
	}

	const assets = criticalNames
		.map((name) => sizeOf(name, distDir))
		.sort((a, b) => b.gzipBytes - a.gzipBytes);
	const budgetOk = checkBudget(
		reportCriticalAssets(assets),
		options.updateBudget,
		options.budgetPath,
	);

	const entryName = findEntryChunk(html);
	if (entryName === null) {
		log('[FAIL] Could not identify the entry module in index.html.', 'red');
		log('  The waterfall assertion cannot run, and a check that did not run must', 'yellow');
		log('  never be reported as one that passed.', 'yellow');
		return 1;
	}

	const runtimeOk = checkRuntimePreloaded(criticalNames, distDir);
	const waterfallOk = checkWaterfall(entryName, criticalNames, distDir);

	if (!budgetOk || !runtimeOk || !waterfallOk) {
		log('\n[FAIL] Critical-path verification failed\n', 'red');
		return 1;
	}
	log(
		`\n[OK] Critical-path verification passed (${assets.length} blocking asset(s) examined)\n`,
		'green',
	);
	return 0;
}

if (import.meta.main) {
	// `--update-budget` rewrites a committed file, so a mistyped flag must not fall through to a
	// run that quietly measures against the old budget instead. Bad arguments exit 2; findings
	// exit 1.
	let options: CriticalPathOptions;
	try {
		options = parseCriticalPathArgs(Bun.argv.slice(2));
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[FAIL] check-critical-path: ${message}`);
		console.error('Usage: bun scripts/check-critical-path.ts [--update-budget]');
		exit(2);
	}
	exit(runCriticalPath(options));
}
