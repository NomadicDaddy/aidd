import type { ProjectLocalIteration, ProjectLocalRun } from '../../../api/types.ts';
import type { OutcomeClassification } from './outcomeClassify.ts';

import { classifyRun, iterationFinalCheckFailures } from './outcomeClassify.ts';

export {
	classifyIteration,
	classifyRun,
	finalCheckLabel,
	iterationFinalCheckFailures,
} from './outcomeClassify.ts';
export type { OutcomeClassification } from './outcomeClassify.ts';

export type OutcomeCategory = 'Blocked' | 'Failed' | 'Scope overrun' | 'Success' | 'Warnings';

// Union of failed final checks across every iteration of a run. Lets the run-level UI flag a
// run whose ledger says success/exit 0 but whose iterations recorded a failed acceptance gate.
export function runFinalCheckFailures(iterations: ProjectLocalIteration[]): string[] {
	const failures = new Set<string>();
	for (const iteration of iterations) {
		for (const name of iterationFinalCheckFailures(iteration.finalChecks)) failures.add(name);
	}
	return [...failures];
}

export const OUTCOME_CATEGORIES: readonly OutcomeCategory[] = [
	'Success',
	'Failed',
	'Blocked',
	'Scope overrun',
	'Warnings',
];

// Whether a run carries warnings that should downgrade an emerald "Success" badge to amber.
// Covers: failed iteration final-check gates, residual untracked artifacts, and source files the
// run itself left uncommitted at run end (residualDirtySourceFiles — dirty at end, not at start).
// runLedgerDirty is deliberately NOT a warning here — it usually reflects pre-existing operator
// dirt (and on all pre-fix ledger entries it was unconditionally true), so it stays an
// informational badge (LocalRunResultBadges' "Ledger out of sync") rather than tainting the
// outcome; the dirty-source field carries the run-caused subset that DOES taint it.
function runHasWarnings(run: ProjectLocalRun, iterations: ProjectLocalIteration[]): boolean {
	if (runFinalCheckFailures(iterations).length > 0) return true;
	if (run.residualUntrackedFeatureDirs.length > 0) return true;
	if (run.residualDirtySourceFiles.length > 0) return true;
	return false;
}

export function categorizeRun(
	run: ProjectLocalRun,
	iterations: ProjectLocalIteration[] = [],
): null | OutcomeCategory {
	const outcome = classifyRun(run);
	if (outcome.label === 'Scope overrun') return 'Scope overrun';
	if (outcome.label === 'Blocked: gate' || outcome.label === 'Blocked: roadmap') return 'Blocked';
	if (outcome.tone === 'emerald') {
		// A run the ledger marks completed/exit 0 still carries a warning when one of its
		// iterations recorded a failed final acceptance check, the ledger is dirty, or
		// residual untracked artifacts were left behind, so it must not filter as clean
		// Success.
		return runHasWarnings(run, iterations) ? 'Warnings' : 'Success';
	}
	if (outcome.tone === 'amber') return 'Warnings';
	if (outcome.tone === 'red') return 'Failed';
	return null;
}

// A run that edited nothing, created nothing, committed nothing, and completed no
// feature is a no-op — it bailed before doing work (e.g. a self-abort on a dirty
// worktree) rather than trying and failing. Surfacing this distinguishes the two.
export function isNoOpRun(run: ProjectLocalRun): boolean {
	return (
		run.filesEdited === 0 &&
		run.filesCreated === 0 &&
		run.commitsCreatedCount === 0 &&
		run.completedFeatures.length === 0
	);
}

// Warning-aware run classification used for the primary outcome badge. Delegates to
// classifyRun for the base classification, then downgrades an emerald "Success" to an
// amber warning when iterations recorded a failed final check or residual untracked
// feature directories were left behind. The original exit code and stop reason remain
// visible in the badge label (e.g. "Success · warnings").
export function classifyRunWithWarnings(
	run: ProjectLocalRun,
	iterations: ProjectLocalIteration[] = [],
): OutcomeClassification {
	const base = classifyRun(run);
	if (base.tone !== 'emerald') return base;
	if (!runHasWarnings(run, iterations)) return base;
	return {
		label: 'Success · warnings',
		title: 'Run completed (exit 0) but carries warnings — failed final checks or residual untracked artifacts. Treat the success as unverified.',
		tone: 'amber',
	};
}
