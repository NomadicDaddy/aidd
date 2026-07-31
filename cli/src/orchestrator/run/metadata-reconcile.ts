import type { RunPlan } from 'aidd-shared/plan/types';

import { reconcileProjectMetadata } from 'aidd-shared/metadata/reconcile';

import type { OrchestratorDeps, RunAccumulator } from './types.ts';

/**
 * Reconcile the project's `.aidd` metadata at run end and return a note for the run summary.
 *
 * This is the orchestrator's answer to the roadmap:apply / --check-features steps that skills used
 * to run out of the aidd installation: those steps needed a path outside the project, which the
 * native backend denies and which no run should have to reach for anyway. Doing it here means the
 * propagation happens on every run, in every mode, whether or not the agent remembered to ask.
 *
 * Fail-soft by construction. Metadata bookkeeping must never be the reason a run's exit code
 * changes, so every failure resolves to a silent `null` and the run reports what it actually did.
 *
 * Read-only runs still reconcile, but only to report. `--directive-readonly` (the web/pipeline
 * `review-only` execution intent) is a promise to the operator that the run leaves the project
 * alone, and a `.aidd` record is part of the project — bookkeeping is not an exemption from it.
 */
export async function reconcileRunMetadata(
	deps: OrchestratorDeps,
	acc: RunAccumulator,
	plan?: RunPlan,
): Promise<null | string> {
	// Zero-iteration runs (preflight blocked, no work, encoding guard) never reached an agent, so
	// there is nothing new to propagate and nothing the operator asked to have validated.
	if (acc.runTotals.iterations === 0) return null;
	const write = plan?.prompt.customDirectiveReadonly !== true;
	try {
		const result = await reconcileProjectMetadata(deps.store, { write });
		for (const warning of result.warnings) console.warn(`[roadmap] ${warning}`);
		for (const error of result.errors) console.error(`[roadmap] ${error}`);
		const notes: string[] = [];
		if (result.errors.length > 0) {
			notes.push(
				`roadmap reconciliation blocked by ${result.errors.length} error(s) — no feature record was rewritten`,
			);
		} else if (result.skippedWrites > 0) {
			notes.push(
				`roadmap drift: ${result.skippedWrites} feature record(s) disagree with the roadmap — not rewritten, this run is read-only`,
			);
		} else if (result.updated > 0) {
			const resolved = result.dependenciesWritten;
			notes.push(
				`roadmap applied: ${result.updated} updated, ${result.total - result.updated} unchanged${resolved > 0 ? `, ${resolved} dependency set(s) resolved` : ''}`,
			);
		}
		if (!result.validation.valid) {
			notes.push(`feature contract issues: ${result.validation.issues.length}`);
			for (const issue of result.validation.issues) {
				console.error(`[check-features] ${issue.id}: ${issue.message}`);
			}
		}
		return notes.length > 0 ? notes.join('; ') : null;
	} catch {
		return null;
	}
}
