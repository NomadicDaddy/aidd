#!/usr/bin/env bun
/**
 * Critical-Path Verification Script
 *
 * Guards the bytes and the *shape* of the first page load. A total-size budget is
 * structurally blind to how bytes are distributed: in spernakit, a release that moved
 * the React runtime out of its preloaded chunk and into a lazily-loaded one changed the
 * total by zero bytes while adding a serialized round trip to every page load, and every
 * size budget passed. Total-size budgets cannot see that. These three checks can:
 *
 *   1. BUDGET    — brotli bytes of everything the browser must fetch before first
 *                  render (entry + modulepreloads + blocking CSS) stays under budget.
 *   2. RUNTIME   — the React runtime sits in a chunk that index.html preloads, so it
 *                  is never discovered late.
 *   3. WATERFALL — the entry chunk never statically imports a chunk that is not
 *                  preloaded. That combination is the round-trip bug by definition:
 *                  the browser cannot know it needs the chunk until it parses the entry.
 *
 * Regenerate the budget after intentional growth:
 *   bun scripts/check-critical-path.ts --update-budget
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const DIST_DIR = join(ROOT_DIR, 'frontend', 'dist');
const ASSETS_DIR = join(DIST_DIR, 'assets');
const INDEX_HTML = join(DIST_DIR, 'index.html');
const BUDGET_PATH = join(__dirname, 'critical-path-budget.json');

/** Headroom applied when writing a new budget so hash/chunk churn doesn't flap the gate. */
const BUDGET_HEADROOM = 1.1;

/**
 * Must track `compressOnce` in backend/src/staticAssets.ts, which serves this app's static assets.
 * Measuring at a different quality than production serves makes every number here a fiction.
 */
const SERVED_BROTLI_QUALITY = 5;

/**
 * Markers unique to React's production runtime. `react.production.js` builds this
 * string for element types; it is absent from react-dom, so it identifies the chunk
 * holding React itself rather than the renderer.
 */
const REACT_RUNTIME_MARKERS = ['react.transitional.element', 'react.fragment'];

// ANSI color codes
const colors: Record<string, string> = {
	blue: '\x1b[34m',
	cyan: '\x1b[36m',
	green: '\x1b[32m',
	red: '\x1b[31m',
	reset: '\x1b[0m',
	yellow: '\x1b[33m',
};

function log(message: string, color = 'reset'): void {
	console.log(`${colors[color] ?? colors['reset']}${message}${colors['reset']}`);
}

function kb(bytes: number): string {
	return `${(bytes / 1024).toFixed(2)} KB`;
}

interface CriticalPathBudget {
	maxCriticalPathBrotliBytes: number;
}

interface CriticalAsset {
	/** Bytes actually sent: the precompressed sibling when nginx has one, else raw. */
	brotliBytes: number;
	name: string;
	rawBytes: number;
}

/**
 * Assets the browser must fetch before it can render: the entry module, everything
 * index.html asks it to modulepreload, and the render-blocking stylesheets.
 * Deliberately excludes prefetch/lazy chunks — those are off the critical path.
 */
function parseCriticalAssets(html: string): string[] {
	const names = new Set<string>();

	// Match whole tags, then inspect their attributes, rather than assuming an
	// attribute order. A regex like /rel="modulepreload"[^>]+href=/ silently misses
	// any tag that emits href first, and a gate that under-counts is worse than none.
	// Matched case-insensitively for the same reason: tag and attribute names are
	// case-insensitive in HTML, so a transform emitting <SCRIPT> or TYPE="module"
	// would zero out this scan and report a passing gate having counted nothing.
	for (const tag of html.matchAll(/<(script|link)\b([^>]*)>/gi)) {
		const [, tagName = '', attrs = ''] = tag;
		const href = /\b(?:src|href)="\/assets\/([^"]+)"/i.exec(attrs)?.[1];
		if (!href) continue;

		if (tagName.toLowerCase() === 'script') {
			if (/\btype="module"/i.test(attrs)) names.add(href);
			continue;
		}
		// Only render-blocking link types belong on the critical path. `prefetch`,
		// `preload as=...`, and `modulepreload` for lazy routes are deliberately excluded.
		if (/\brel="(?:modulepreload|stylesheet)"/i.test(attrs)) names.add(href);
	}
	return [...names];
}

function sizeOf(assetName: string): CriticalAsset {
	const raw = join(ASSETS_DIR, assetName);
	const br = `${raw}.br`;
	const rawBytes = statSync(raw).size;
	// This build emits no precompressed siblings, so brotli is computed here. Falling back to RAW
	// bytes (as the spernakit original does, where the build does emit .br) would silently turn
	// this into a ~3.5x looser raw-size budget while still printing "br".
	//
	// The quality must match what THIS app actually serves, not what a static precompression step
	// would produce. backend/src/staticAssets.ts compresses on demand at BROTLI_PARAM_QUALITY 5
	// and memoises the result, so quality 11 understated real delivered bytes by ~15 KB — enough
	// to pass an artifact that was over its own stated budget.
	const brotliBytes = existsSync(br)
		? statSync(br).size
		: brotliCompressSync(readFileSync(raw), {
				params: { [constants.BROTLI_PARAM_QUALITY]: SERVED_BROTLI_QUALITY },
			}).length;
	return { brotliBytes, name: assetName, rawBytes };
}

/**
 * The entry module, located with the same order-independent scan parseCriticalAssets uses. The
 * previous `/<script[^>]+type="module"[^>]+src=/` regex assumed `type` precedes `src`; any bundler
 * or HTML transform emitting them the other way round produced no match, and the caller turned
 * that into a silently skipped waterfall assertion — a gate reporting success having checked
 * nothing. Returns null so the caller must decide explicitly.
 */
function findEntryChunk(html: string): null | string {
	for (const tag of html.matchAll(/<script\b([^>]*)>/gi)) {
		const attrs = tag[1] ?? '';
		if (!/\btype="module"/i.test(attrs)) continue;
		const src = /\bsrc="\/assets\/([^"]+)"/i.exec(attrs)?.[1];
		if (src) return src;
	}
	return null;
}

/** Chunks the entry imports statically, i.e. needed before anything can execute. */
function staticImportsOf(entryName: string): string[] {
	const source = readFileSync(join(ASSETS_DIR, entryName), 'utf-8');
	const imports = new Set<string>();
	// Binding imports (`...from"./c.js"`) AND side-effect imports (`import"./c.js"`). Matching
	// only the first under-reports the waterfall: a side-effect import is just as serialized, and
	// a chunk pulled in purely for its side effects is exactly the kind a refactor introduces
	// without anyone noticing. `import("./c.js")` is deliberately not matched — dynamic imports
	// are lazy by definition and belong off the critical path.
	for (const m of source.matchAll(/(?:from|import)\s*["']\.\/([^"']+\.js)["']/g)) {
		if (m[1]) imports.add(m[1]);
	}
	return [...imports];
}

function findReactRuntimeChunk(): null | string {
	// Only .js chunks can hold the runtime; skip .br/.gz/.map siblings and CSS.
	for (const name of readdirSync(ASSETS_DIR).filter((f) => f.endsWith('.js'))) {
		const content = readFileSync(join(ASSETS_DIR, name), 'utf-8');
		if (REACT_RUNTIME_MARKERS.some((marker) => content.includes(marker))) return name;
	}
	return null;
}

function checkBudget(totalBrotli: number, updateBudget: boolean): boolean {
	if (updateBudget) {
		const budget: CriticalPathBudget = {
			maxCriticalPathBrotliBytes: Math.ceil(totalBrotli * BUDGET_HEADROOM),
		};
		writeFileSync(BUDGET_PATH, `${JSON.stringify(budget, null, '\t')}\n`);
		log(
			`\nBudget written to scripts/critical-path-budget.json (${kb(budget.maxCriticalPathBrotliBytes)}, +${Math.round((BUDGET_HEADROOM - 1) * 100)}% headroom)`,
			'cyan'
		);
		return true;
	}

	if (!existsSync(BUDGET_PATH)) {
		log('\nNo scripts/critical-path-budget.json found — budget check skipped.', 'yellow');
		log('Create one with: bun scripts/check-critical-path.ts --update-budget', 'yellow');
		return true;
	}

	const budget = JSON.parse(readFileSync(BUDGET_PATH, 'utf-8')) as CriticalPathBudget;
	if (totalBrotli > budget.maxCriticalPathBrotliBytes) {
		log(
			`✗ Critical path ${kb(totalBrotli)} exceeds budget ${kb(budget.maxCriticalPathBrotliBytes)}`,
			'red'
		);
		log(
			'If the growth is intentional, regenerate: bun scripts/check-critical-path.ts --update-budget',
			'yellow'
		);
		return false;
	}
	log(
		`✓ Critical path ${kb(totalBrotli)} within budget ${kb(budget.maxCriticalPathBrotliBytes)}`,
		'green'
	);
	return true;
}

function main(): void {
	const updateBudget = process.argv.includes('--update-budget');

	log('\n=== Critical-Path Verification ===\n', 'blue');

	if (!existsSync(INDEX_HTML)) {
		log('✗ frontend/dist/index.html not found — build the frontend first:', 'red');
		log('  bun run build:frontend', 'yellow');
		process.exit(1);
	}

	const html = readFileSync(INDEX_HTML, 'utf-8');
	const criticalNames = parseCriticalAssets(html);
	if (criticalNames.length === 0) {
		log('✗ No entry/modulepreload/stylesheet assets found in index.html', 'red');
		process.exit(1);
	}

	const assets = criticalNames.map(sizeOf).sort((a, b) => b.brotliBytes - a.brotliBytes);
	const totalBrotli = assets.reduce((s, a) => s + a.brotliBytes, 0);
	const totalRaw = assets.reduce((s, a) => s + a.rawBytes, 0);

	for (const a of assets) {
		log(`${a.name.padEnd(45)} ${kb(a.brotliBytes).padStart(12)} br  (${kb(a.rawBytes)} raw)`);
	}
	log(
		`\n${String(assets.length).padStart(2)} blocking assets   ${kb(totalBrotli)} br  (${kb(totalRaw)} raw)\n`,
		'cyan'
	);

	const budgetOk = checkBudget(totalBrotli, updateBudget);

	// --- Check 2: the React runtime must be preloaded, not discovered late ---
	const entryName = findEntryChunk(html);
	if (entryName === null) {
		log('✗ Could not identify the entry module in index.html.', 'red');
		log('  The waterfall assertion cannot run, and a check that did not run must', 'yellow');
		log('  never be reported as one that passed.', 'yellow');
		process.exit(1);
	}
	const reactChunk = findReactRuntimeChunk();
	let runtimeOk = true;

	if (!reactChunk) {
		log(
			'✗ Could not locate the React runtime in any chunk — update REACT_RUNTIME_MARKERS.',
			'red'
		);
		runtimeOk = false;
	} else if (!criticalNames.includes(reactChunk)) {
		log(`✗ React runtime lives in ${reactChunk}, which index.html does not preload.`, 'red');
		log('  It will be discovered only after the entry chunk is parsed, costing a', 'yellow');
		log(
			'  round trip on every page load. This build declares no manual chunking, so',
			'yellow'
		);
		log(
			'  the cause is whatever split react out of the entry — check for a new lazy',
			'yellow'
		);
		log('  import boundary above the React import in frontend/src.', 'yellow');
		runtimeOk = false;
	} else {
		log(`✓ React runtime is in ${reactChunk}, which is preloaded`, 'green');
	}

	// --- Check 3: no static import of a chunk the browser was not told to preload ---
	let waterfallOk = true;
	{
		const late = staticImportsOf(entryName).filter((dep) => !criticalNames.includes(dep));
		if (late.length > 0) {
			log(`✗ Entry chunk statically imports ${late.length} non-preloaded chunk(s):`, 'red');
			for (const dep of late) log(`    ${dep}`, 'red');
			log(
				'  A static import that is not preloaded is a serialized round trip: the',
				'yellow'
			);
			log('  browser cannot request it until it has parsed the entry chunk.', 'yellow');
			waterfallOk = false;
		} else {
			log('✓ Entry chunk statically imports only preloaded chunks', 'green');
		}
	}

	if (!budgetOk || !runtimeOk || !waterfallOk) {
		log('\n✗ Critical-path verification failed\n', 'red');
		process.exit(1);
	}
	log('\n✓ Critical-path verification passed\n', 'green');
}

main();
