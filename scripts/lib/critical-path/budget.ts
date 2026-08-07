/**
 * The critical-path byte budget: reading it, comparing this build against it, and regenerating it
 * after intentional growth.
 *
 * Extracted from scripts/check-critical-path.ts (max-lines split). Reports its own verdict and
 * returns it; the gate keeps sole ownership of the exit code.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { kb, log } from './report.ts';

const BUDGET_PATH = join(
	dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
	'critical-path-budget.json',
);

/** Headroom applied when writing a new budget so hash/chunk churn doesn't flap the gate. */
const BUDGET_HEADROOM = 1.1;

interface CriticalPathBudget {
	maxCriticalPathBrotliBytes: number;
}

export function checkBudget(totalBrotli: number, updateBudget: boolean): boolean {
	if (updateBudget) {
		const budget: CriticalPathBudget = {
			maxCriticalPathBrotliBytes: Math.ceil(totalBrotli * BUDGET_HEADROOM),
		};
		writeFileSync(BUDGET_PATH, `${JSON.stringify(budget, null, '\t')}\n`);
		log(
			`\n[OK] Budget written to scripts/critical-path-budget.json (${kb(budget.maxCriticalPathBrotliBytes)}, +${Math.round((BUDGET_HEADROOM - 1) * 100)}% headroom)`,
			'cyan',
		);
		return true;
	}

	if (!existsSync(BUDGET_PATH)) {
		log(
			'\n[WARN] No scripts/critical-path-budget.json found — budget check skipped.',
			'yellow',
		);
		log('Create one with: bun scripts/check-critical-path.ts --update-budget', 'yellow');
		return true;
	}

	const budget = JSON.parse(readFileSync(BUDGET_PATH, 'utf-8')) as CriticalPathBudget;
	if (totalBrotli > budget.maxCriticalPathBrotliBytes) {
		log(
			`[FAIL] Critical path ${kb(totalBrotli)} exceeds budget ${kb(budget.maxCriticalPathBrotliBytes)}`,
			'red',
		);
		log(
			'If the growth is intentional, regenerate: bun scripts/check-critical-path.ts --update-budget',
			'yellow',
		);
		return false;
	}
	log(
		`[OK] Critical path ${kb(totalBrotli)} within budget ${kb(budget.maxCriticalPathBrotliBytes)}`,
		'green',
	);
	return true;
}
