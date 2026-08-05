import type { ProjectLocalIteration, ProjectLocalRun } from '../../../api/types.ts';

import { Badge } from '../../ui/badge.tsx';
import { Tooltip } from '../../ui/tooltip.tsx';
import {
	classifyRunWithWarnings,
	finalCheckLabel,
	isNoOpRun,
	runFinalCheckFailures,
} from './outcome.ts';

export function LocalRunResultBadges({
	run,
	runIterations,
}: {
	run: ProjectLocalRun;
	runIterations: ProjectLocalIteration[];
}) {
	const outcome = classifyRunWithWarnings(run, runIterations);
	const unattributedDirtySourceFiles = run.unattributedDirtySourceFiles ?? [];
	return (
		<span className="inline-flex flex-wrap items-center gap-1.5">
			<Tooltip content={outcome.title}>
				<span className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
					<Badge showDot tone={outcome.tone}>
						{outcome.label}
					</Badge>
				</span>
			</Tooltip>
			{run.runLedgerDirty ? (
				<Tooltip content="Run summary could not be reconciled into the latest commit; recorded metrics may be incomplete.">
					<span className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
						<Badge tone="teal">Ledger out of sync</Badge>
					</span>
				</Tooltip>
			) : null}
			{run.residualDirtySourceFiles.length > 0 ? (
				<Tooltip
					content={`Source files left uncommitted at run end (not dirty at run start):\n${run.residualDirtySourceFiles.join('\n')}`}>
					<span className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
						<Badge tone="amber">Uncommitted source</Badge>
					</span>
				</Tooltip>
			) : null}
			{unattributedDirtySourceFiles.length > 0 ? (
				<Tooltip
					content={`Source files changed in the worktree during this run but were not attributable to it:\n${unattributedDirtySourceFiles.join('\n')}`}>
					<span className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
						<Badge tone="teal">Concurrent source changes</Badge>
					</span>
				</Tooltip>
			) : null}
			{run.residualUntrackedFeatureDirs.length > 0 ? (
				<Tooltip
					content={`Residual untracked feature directories left after the run:\n${run.residualUntrackedFeatureDirs.join('\n')}`}>
					<span className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
						<Badge tone="amber">Untracked artifacts</Badge>
					</span>
				</Tooltip>
			) : null}
			{(() => {
				const failedChecks = runFinalCheckFailures(runIterations);
				if (failedChecks.length === 0) return null;
				const names = failedChecks.map(finalCheckLabel).join(', ');
				return (
					<Tooltip
						content={`A recorded final acceptance check failed during this run: ${names}. The exit code and stop reason above are preserved; treat the success as unverified.`}>
						<span className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
							<Badge tone="amber">Final check failed: {names}</Badge>
						</span>
					</Tooltip>
				);
			})()}
			{(outcome.tone === 'red' || outcome.tone === 'amber') && isNoOpRun(run) ? (
				<Tooltip content="Run produced no edits, no new files, no commits, and completed no features — a no-op self-abort.">
					<span className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
						<Badge tone="neutral">No changes</Badge>
					</span>
				</Tooltip>
			) : null}
			{/* A bare monospace numeral sat between the outcome badge and the iteration count
			    with nothing saying what it counted — '0' read as a quantity, not a process exit
			    status. It is only worth a badge when it is not the thing the outcome badge already
			    says, so a clean success drops it entirely. */}
			{outcome.tone === 'emerald' ? null : (
				<Badge title="Process exit code" tone="neutral">
					exit {run.exitCode ?? '—'}
				</Badge>
			)}
			<span className="text-xs text-muted-foreground">
				{runIterations.length} {runIterations.length === 1 ? 'iteration' : 'iterations'}
			</span>
		</span>
	);
}
