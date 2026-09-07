#!/usr/bin/env bun
/**
 * Minification Verification Script
 *
 * Inspects the actual frontend build output (frontend/dist/assets) and fails when:
 *   - frontend/dist is missing (run `bun run build:frontend` first)
 *   - any JS asset looks unminified (average line length below the heuristic
 *     threshold for files larger than 5 KB)
 *   - the total bundle size exceeds the budget in scripts/bundle-budget.json
 *
 * Enforces: the built frontend ships minified assets within the recorded bundle budget. No
 * assertion ID: the rule lives in this gate and scripts/bundle-budget.json, and `.aidd/` files it
 * under no ASSERT- number today.
 *
 * Regenerate the budget after intentional bundle growth:
 *   bun scripts/verify-minification.ts --update-budget
 *
 * Run: bun run verify-minification [--root <dir>] [--update-budget]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { exit } from 'node:process';
import { parseArgs } from 'node:util';

/** Files >5KB with an average line length below this look unminified. */
const MIN_AVG_LINE_LENGTH = 200;
const MINIFY_CHECK_MIN_BYTES = 5 * 1024;
/** Headroom applied when writing a new budget so hash/chunk churn doesn't flap the gate. */
const BUDGET_HEADROOM = 1.1;

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

interface AssetInfo {
	avgLineLength: number;
	name: string;
	sizeBytes: number;
	type: 'css' | 'js';
}

interface BundleBudget {
	maxCssBytes: number;
	maxJsBytes: number;
}

function rawAvgLineLength(content: string): number {
	const lines = content.split('\n').filter((l) => l.length > 0);
	return lines.length > 0 ? content.length / lines.length : 0;
}

/**
 * Average line length is a proxy for "did the minifier run", but it misreads any chunk that embeds
 * multi-line content. In valid JS a RAW newline can only occur inside a template literal — single
 * and double quoted strings cannot span lines, and minifiers strip comments — so a minified chunk
 * carrying markdown, SVG, or SQL in backticks is full of newlines the minifier could not remove and
 * scores identically to unminified source. aidd's docs-content chunk is exactly that: one minified
 * `var e=Object.assign({...})` statement whose values are whole documentation pages, 583 of its 584
 * newlines sitting inside template literals.
 *
 * Measuring only the code OUTSIDE template literals is what the heuristic always meant to measure.
 */
function codeAvgLineLength(content: string): number {
	let inTemplate = false;
	let chars = 0;
	let lines = 1;

	for (let i = 0; i < content.length; i++) {
		const ch = content[i];
		// Skip the escaped character wholesale so an escaped backtick cannot flip the state.
		if (ch === '\\') {
			i++;
			continue;
		}
		if (ch === '`') {
			inTemplate = !inTemplate;
			continue;
		}
		if (inTemplate) continue;
		chars++;
		if (ch === '\n') lines++;
	}

	return chars / lines;
}

async function collectAssets(dir: string, found: AssetInfo[] = []): Promise<AssetInfo[]> {
	for (const entry of await readdir(dir)) {
		const fullPath = join(dir, entry);
		const stats = await stat(fullPath);
		if (stats.isDirectory()) {
			await collectAssets(fullPath, found);
			continue;
		}
		const isJs = entry.endsWith('.js');
		const isCss = entry.endsWith('.css');
		if (!isJs && !isCss) continue; // skips .gz/.br/.map siblings

		const content = readFileSync(fullPath, 'utf-8');
		const avgLineLength = isJs ? codeAvgLineLength(content) : rawAvgLineLength(content);
		found.push({
			avgLineLength,
			name: entry,
			sizeBytes: stats.size,
			type: isJs ? 'js' : 'css',
		});
	}
	return found;
}

function kb(bytes: number): string {
	return `${(bytes / 1024).toFixed(2)} KB`;
}

function checkBudget(
	root: string,
	totalJs: number,
	totalCss: number,
	updateBudget: boolean,
): boolean {
	const budgetPath = join(root, 'scripts', 'bundle-budget.json');

	if (updateBudget) {
		const budget: BundleBudget = {
			maxCssBytes: Math.ceil(totalCss * BUDGET_HEADROOM),
			maxJsBytes: Math.ceil(totalJs * BUDGET_HEADROOM),
		};
		writeFileSync(budgetPath, `${JSON.stringify(budget, null, '\t')}\n`, 'utf-8');
		log(
			`\nBudget written to scripts/bundle-budget.json (${BUDGET_HEADROOM}x headroom)`,
			'cyan',
		);
		return true;
	}

	if (!existsSync(budgetPath)) {
		log('\n[SKIP] No scripts/bundle-budget.json found — budget check skipped.', 'yellow');
		log('Create one with: bun scripts/verify-minification.ts --update-budget', 'yellow');
		return true;
	}

	const budget = JSON.parse(readFileSync(budgetPath, 'utf-8')) as BundleBudget;
	let ok = true;

	if (totalJs > budget.maxJsBytes) {
		log(`  JS bundle ${kb(totalJs)} exceeds budget ${kb(budget.maxJsBytes)}`, 'red');
		ok = false;
	} else {
		log(`  JS bundle ${kb(totalJs)} within budget ${kb(budget.maxJsBytes)}`, 'green');
	}

	if (totalCss > budget.maxCssBytes) {
		log(`  CSS bundle ${kb(totalCss)} exceeds budget ${kb(budget.maxCssBytes)}`, 'red');
		ok = false;
	} else {
		log(`  CSS bundle ${kb(totalCss)} within budget ${kb(budget.maxCssBytes)}`, 'green');
	}

	if (!ok) {
		log(
			'If the growth is intentional, regenerate: bun scripts/verify-minification.ts --update-budget',
			'yellow',
		);
	}
	return ok;
}

export interface MinificationOptions {
	root?: string | undefined;
	/** Rewrite the budget from this build instead of asserting against it. */
	updateBudget?: boolean | undefined;
}

/**
 * Run the gate. Returns the process exit code: 0 pass, 1 findings.
 *
 * A missing `frontend/dist/assets` is a finding rather than a could-not-run. The gate's whole
 * subject is the build output, and "there is no build output" is the strongest thing it can say
 * about it; an empty assets directory is a failure here for the same reason.
 */
export async function runMinification(options: MinificationOptions = {}): Promise<number> {
	const root = resolve(options.root ?? join(import.meta.dir, '..'));
	const assetsDir = join(root, 'frontend', 'dist', 'assets');
	const updateBudget = options.updateBudget === true;

	log('\n=== Minification Verification ===\n', 'blue');

	if (!existsSync(assetsDir)) {
		log('[FAIL] frontend/dist/assets not found — build the frontend first:', 'red');
		log('  bun run build:frontend', 'yellow');
		return 1;
	}

	const assets = await collectAssets(assetsDir);
	if (assets.length === 0) {
		log('[FAIL] No JS/CSS assets found in frontend/dist/assets', 'red');
		return 1;
	}

	assets.sort((a, b) => b.sizeBytes - a.sizeBytes);

	const unminified: AssetInfo[] = [];
	for (const asset of assets) {
		const suspicious =
			asset.type === 'js' &&
			asset.sizeBytes > MINIFY_CHECK_MIN_BYTES &&
			asset.avgLineLength < MIN_AVG_LINE_LENGTH;
		if (suspicious) unminified.push(asset);
		log(
			`${asset.name.padEnd(45)} ${kb(asset.sizeBytes).padStart(12)}  (avg line ${Math.round(asset.avgLineLength)})`,
			suspicious ? 'red' : 'reset',
		);
	}

	const js = assets.filter((a) => a.type === 'js');
	const css = assets.filter((a) => a.type === 'css');
	const totalJs = js.reduce((s, a) => s + a.sizeBytes, 0);
	const totalCss = css.reduce((s, a) => s + a.sizeBytes, 0);

	log('\n=== Totals ===\n', 'cyan');
	log(`JS:  ${kb(totalJs)} across ${js.length} files`);
	log(`CSS: ${kb(totalCss)} across ${css.length} files`);

	const budgetOk = checkBudget(root, totalJs, totalCss, updateBudget);

	if (unminified.length > 0) {
		log(`\n[FAIL] ${unminified.length} JS asset(s) look unminified:`, 'red');
		for (const a of unminified) {
			log(
				`  ${a.name}: ${kb(a.sizeBytes)}, avg line length ${Math.round(a.avgLineLength)} < ${MIN_AVG_LINE_LENGTH}`,
				'red',
			);
		}
		log('Check frontend/vite.config.ts build.minify settings.', 'yellow');
	}

	if (unminified.length > 0 || !budgetOk) {
		log('\n[FAIL] verify-minification -- minification verification failed\n', 'red');
		return 1;
	}

	log(
		`\n[OK] verify-minification -- ${assets.length} assets inspected ` +
			`(${js.length} JS, ${css.length} CSS), all minified and within budget\n`,
		'green',
	);
	return 0;
}

if (import.meta.main) {
	// `parseArgs` throws on an unknown flag, and an uncaught throw exits 1 -- the code reserved for
	// findings. A mistyped flag reporting "one unminified asset" is the confusion the status codes
	// exist to end, so bad arguments are caught and mapped onto 2 here.
	let options: MinificationOptions;
	try {
		const { values } = parseArgs({
			args: Bun.argv.slice(2),
			options: {
				root: { type: 'string' },
				'update-budget': { type: 'boolean' },
			},
			strict: true,
		});
		options = { root: values.root, updateBudget: values['update-budget'] };
	} catch (err) {
		log(`[FAIL] verify-minification: ${(err as Error).message}`, 'red');
		log('Usage: verify-minification [--root <dir>] [--update-budget]', 'yellow');
		exit(2);
	}
	exit(await runMinification(options));
}
