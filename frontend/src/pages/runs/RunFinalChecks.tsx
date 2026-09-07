import type { RunFinalCheckState } from './runFinalCheckState.ts';

import { FinalCheckResultBadges } from '../../components/shared/local-aidd-history/FinalCheckBadges.tsx';

const explanations: Readonly<Record<string, string>> = {
	loading: 'Reading project history…',
	'metadata-error': 'Project history could not be read, so the checks are unknown.',
	'no-checks': 'No final checks were recorded for this run.',
	unmatched: "This run has no entry in the project's local iteration ledger.",
};

/**
 * The final acceptance checks a run recorded, or why none are shown. Rendered inside the detail
 * panel's metadata grid, so the empty states are one muted line rather than a placeholder block.
 */
export function RunFinalChecks({ state }: { state: RunFinalCheckState }) {
	if (state.kind === 'checks') return <FinalCheckResultBadges iterations={state.iterations} />;
	return <span className="text-muted-foreground">{explanations[state.kind]}</span>;
}
