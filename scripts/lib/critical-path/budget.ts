/**
 * The critical-path byte budget: reading it, comparing this build against it, and regenerating it
 * after intentional growth.
 *
 * Two numbers, and they are not the same kind of thing.
 *
 * `maxCriticalPathBrotliBytes` is a ratchet. It tracks whatever the build currently costs and is
 * regenerated with `--update-budget` after deliberate growth, so it catches accidental growth
 * between releases and nothing else.
 *
 * `maxCriticalPathGzipBytes` is a ceiling: the PERFORMANCE budget for what a browser must fetch
 * before first render, in the encoding most clients actually negotiate. It is a product
 * commitment, not a record of the status quo, so `--update-budget` carries it through untouched.
 * Regenerating a ratchet must never quietly raise a ceiling — that is precisely how the critical
 * path came to sit 32% above this one while every gate reported green.
 *
 * Extracted from scripts/check-critical-path.ts (max-lines split). Reports its own verdict and
 * returns it; the gate keeps sole ownership of the exit code.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { kb, log } from './report.ts';

export const DEFAULT_BUDGET_PATH = join(
	dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
	'critical-path-budget.json',
);

/** Headroom applied when writing a new budget so hash/chunk churn doesn't flap the gate. */
const BUDGET_HEADROOM = 1.1;

/** 170 KB. The ceiling this gate exists to hold; only a product decision moves it. */
export const CRITICAL_PATH_GZIP_CEILING = 174_080;

export interface CriticalPathBudget {
	maxCriticalPathBrotliBytes: number;
	maxCriticalPathGzipBytes: number;
}

export interface CriticalPathTotals {
	brotliBytes: number;
	gzipBytes: number;
}

/**
 * The budget a `--update-budget` run should write: a fresh brotli ratchet, and the gzip ceiling
 * exactly as it stood.
 */
export function nextBudget(
	totals: CriticalPathTotals,
	current: CriticalPathBudget | undefined,
): CriticalPathBudget {
	return {
		maxCriticalPathBrotliBytes: Math.ceil(totals.brotliBytes * BUDGET_HEADROOM),
		maxCriticalPathGzipBytes: current?.maxCriticalPathGzipBytes ?? CRITICAL_PATH_GZIP_CEILING,
	};
}

/** Every way this build is over budget, worst first. Pure: no reading, no printing. */
export function budgetFailures(totals: CriticalPathTotals, budget: CriticalPathBudget): string[] {
	const failures: string[] = [];
	if (totals.gzipBytes > budget.maxCriticalPathGzipBytes) {
		failures.push(
			`Critical path ${kb(totals.gzipBytes)} gzip exceeds the ${kb(budget.maxCriticalPathGzipBytes)} ceiling by ${kb(totals.gzipBytes - budget.maxCriticalPathGzipBytes)}`,
		);
	}
	if (totals.brotliBytes > budget.maxCriticalPathBrotliBytes) {
		failures.push(
			`Critical path ${kb(totals.brotliBytes)} br exceeds budget ${kb(budget.maxCriticalPathBrotliBytes)}`,
		);
	}
	return failures;
}

function readBudget(budgetPath: string): CriticalPathBudget | undefined {
	if (!existsSync(budgetPath)) return undefined;
	return JSON.parse(readFileSync(budgetPath, 'utf-8')) as CriticalPathBudget;
}

export function checkBudget(
	totals: CriticalPathTotals,
	updateBudget: boolean,
	budgetPath: string = DEFAULT_BUDGET_PATH,
): boolean {
	const current = readBudget(budgetPath);

	if (updateBudget) {
		const budget = nextBudget(totals, current);
		writeFileSync(budgetPath, `${JSON.stringify(budget, null, '\t')}\n`);
		log(
			`\n[OK] Budget written to scripts/critical-path-budget.json (${kb(budget.maxCriticalPathBrotliBytes)} br, +${Math.round((BUDGET_HEADROOM - 1) * 100)}% headroom)`,
			'cyan',
		);
		log(
			`     gzip ceiling kept at ${kb(budget.maxCriticalPathGzipBytes)} — a ratchet may not raise a ceiling.`,
			'cyan',
		);
		return true;
	}

	if (current === undefined) {
		log(
			'\n[WARN] No scripts/critical-path-budget.json found — budget check skipped.',
			'yellow',
		);
		log('Create one with: bun scripts/check-critical-path.ts --update-budget', 'yellow');
		return true;
	}

	const failures = budgetFailures(totals, current);
	if (failures.length > 0) {
		for (const failure of failures) log(`[FAIL] ${failure}`, 'red');
		log(
			'Brotli growth that is intentional is regenerated with: bun scripts/check-critical-path.ts --update-budget',
			'yellow',
		);
		log(
			'The gzip ceiling is not regenerated. Move code off the critical path instead: lazy',
			'yellow',
		);
		log('  route and dialog boundaries, then re-measure.', 'yellow');
		return false;
	}
	log(
		`[OK] Critical path ${kb(totals.gzipBytes)} gzip within ceiling ${kb(current.maxCriticalPathGzipBytes)}`,
		'green',
	);
	log(
		`[OK] Critical path ${kb(totals.brotliBytes)} br within budget ${kb(current.maxCriticalPathBrotliBytes)}`,
		'green',
	);
	return true;
}
