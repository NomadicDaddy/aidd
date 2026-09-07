import type { ProjectLocalIteration } from '../../api/types.ts';

import { runFinalCheckResults } from '../../components/shared/local-aidd-history/finalChecks.ts';

/**
 * What the detail panel can say about a run's final acceptance checks.
 *
 * The four non-check states are deliberately distinct. "The gate was not recorded" and "the gate
 * could not be read" are different claims about a run, and collapsing either into a bare "None"
 * would let a failed metadata request read as a clean run.
 */
export type RunFinalCheckState =
	/** The run matched an iteration and that iteration recorded at least one check. */
	| { iterations: ProjectLocalIteration[]; kind: 'checks' }
	/** Project metadata is still loading. */
	| { kind: 'loading' }
	/** The project-detail request failed, so nothing is known either way. */
	| { kind: 'metadata-error' }
	/** The run matched an iteration, which recorded no final checks. */
	| { kind: 'no-checks' }
	/** No iteration in the project's ledger carries this run's id. */
	| { kind: 'unmatched' };

/**
 * Resolves a run against the project's local iteration ledger by run id. Checks are never
 * inferred from the exit code or the summary text: a run that exits 0 with a failed smoke:qc is
 * exactly the case this exists to surface, and neither of those fields distinguishes it.
 */
export function resolveRunFinalCheckState({
	isError,
	iterations,
	runId,
}: {
	isError: boolean;
	iterations: ProjectLocalIteration[] | undefined;
	runId: string;
}): RunFinalCheckState {
	if (isError) return { kind: 'metadata-error' };
	if (!iterations) return { kind: 'loading' };
	const matched = iterations.filter((iteration) => iteration.runId === runId);
	if (matched.length === 0) return { kind: 'unmatched' };
	if (runFinalCheckResults(matched).length === 0) return { kind: 'no-checks' };
	return { iterations: matched, kind: 'checks' };
}
