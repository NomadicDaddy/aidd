import type {
	FinalCheckStatus,
	FinalCheckSummary,
	ProjectLocalIteration,
} from '../../../api/types.ts';

import { finalCheckLabel } from './outcomeClassify.ts';

export interface FinalCheckResult {
	/** Human label from finalCheckLabel - 'smoke:qc' rather than the 'smokeQc' field name. */
	label: string;
	name: string;
	status: FinalCheckStatus;
}

// The order the checks are reported in, so project History and Runs detail cannot list the same
// run's checks in two different orders. It is the order the CLI runs them in - the broad gate
// first, then the narrower ones it subsumes. Walking these keys rather than the recorded object
// is also what keeps a status typed: Object.entries over an interface yields \`any\` values.
const finalCheckOrder: readonly (keyof FinalCheckSummary)[] = [
	'smokeQc',
	'typecheck',
	'build',
	'format',
];

/**
 * Every final acceptance check recorded across a run's iterations, deduplicated by name.
 *
 * A failure anywhere in the run is the run's answer for that check: a later iteration passing
 * smoke:qc does not un-fail the earlier one that failed it, and the amber badge the History row
 * shows is about the run, not about its last iteration.
 */
export function runFinalCheckResults(iterations: ProjectLocalIteration[]): FinalCheckResult[] {
	const results: FinalCheckResult[] = [];
	for (const name of finalCheckOrder) {
		let status: FinalCheckStatus | undefined;
		for (const iteration of iterations) {
			const recorded = iteration.finalChecks?.[name];
			if (!recorded) continue;
			if (recorded === 'failed') {
				status = 'failed';
				break;
			}
			status ??= recorded;
		}
		if (status) results.push({ label: finalCheckLabel(name), name, status });
	}
	return results;
}
