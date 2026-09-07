import type { ProjectLocalIteration } from '../../../api/types.ts';

import { Badge } from '../../ui/badge.tsx';
import { Tooltip } from '../../ui/tooltip.tsx';
import { runFinalCheckResults } from './finalChecks.ts';

// Both surfaces that report a run's final acceptance checks — the project History row and the
// Runs detail panel — render them from here, so a check's name reads the same in both places
// and neither can grow its own spelling of 'smoke:qc'.

/**
 * Amber warning for a run whose iterations recorded a failed acceptance gate. Renders nothing
 * when every recorded check passed, so a clean run keeps a clean row.
 */
export function FinalCheckFailureBadge({ iterations }: { iterations: ProjectLocalIteration[] }) {
	const failures = runFinalCheckResults(iterations).filter(
		(result) => result.status === 'failed',
	);
	if (failures.length === 0) return null;
	const names = failures.map((result) => result.label).join(', ');
	return (
		<Tooltip
			content={`A recorded final acceptance check failed during this run: ${names}. The exit code and stop reason above are preserved; treat the success as unverified.`}>
			<span className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
				<Badge tone="amber">Final check failed: {names}</Badge>
			</span>
		</Tooltip>
	);
}

/**
 * Every recorded check with its result, passes included. The status is in the badge text rather
 * than only in its tone, because "which gate ran and did it pass" is the question this answers
 * and a colour alone does not answer it.
 */
export function FinalCheckResultBadges({ iterations }: { iterations: ProjectLocalIteration[] }) {
	return (
		<span className="inline-flex flex-wrap items-center gap-1.5">
			{runFinalCheckResults(iterations).map((result) => (
				<Badge key={result.name} tone={result.status === 'failed' ? 'amber' : 'emerald'}>
					{result.label} {result.status}
				</Badge>
			))}
		</span>
	);
}
