import { default as CircleDashed } from 'lucide-react/dist/esm/icons/circle-dashed';
import { default as Terminal } from 'lucide-react/dist/esm/icons/terminal';

import { ExecutionIdentityBadges } from '../../components/shared/ExecutionIdentityBadges.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { IconButton } from '../../components/ui/button.tsx';
import { cn } from '../../lib/cn.ts';
import { formatActiveDuration } from '../../lib/formatters.ts';
import { stepTypeLabel } from '../../lib/stepTypeLabel.ts';
import { FailureReason } from './FailureReason.tsx';
import { sessionStatusTone, stepStatusLabel } from './pipelineSessionStatus.ts';
import { stepIndentPx, usePipelineStepSubRows } from './pipelineStepSubRowModel.ts';
import { containerSelectedClass } from './runRowUtils.ts';

/**
 * The steps of an expanded pipeline session below `xl`, where the feed is cards rather than a table.
 *
 * The desktop rows live in PipelineStepTableRows and are real `<tr>` elements of the parent table;
 * this list is the same steps in the shape the surrounding cards use. Both read the same model, so
 * the two views can differ in box and never in content.
 */
export function PipelineStepSubRows({
	now,
	onSelectRun,
	selectedRunId,
	sessionId,
}: {
	now: number;
	onSelectRun: (runId: string) => void;
	selectedRunId: string | undefined;
	sessionId: string;
}) {
	const { notice, rows } = usePipelineStepSubRows(sessionId);
	if (notice !== null) return <p className="px-4 py-3 text-xs text-muted-foreground">{notice}</p>;
	return (
		<ol aria-label="Pipeline steps" className="divide-y divide-border">
			{rows.map((row) => {
				if (row.kind === 'pending') {
					return (
						<li
							className="flex flex-wrap items-center gap-2 px-4 py-2 text-xs text-muted-foreground"
							key={`pending-${row.sequenceNumber}`}>
							<span className="w-6 text-right font-mono">{row.sequenceNumber}.</span>
							<span className="min-w-0 flex-1 truncate">{row.step.name}</span>
							<Badge tone="neutral">{stepTypeLabel(row.step.stepType)}</Badge>
							<Badge tone="neutral">
								<CircleDashed aria-hidden="true" className="h-3 w-3" />
								Pending
							</Badge>
						</li>
					);
				}
				const step = row.result;
				const anchor = step.depth === 0 && step.phase === 'step';
				const selected = step.runId !== null && step.runId === selectedRunId;
				return (
					<li
						aria-current={selected ? 'true' : undefined}
						className={cn('py-2 pr-4 text-xs', selected && containerSelectedClass)}
						key={step.id}
						style={{ paddingLeft: `${stepIndentPx(step.depth)}px` }}>
						<div className="flex min-w-0 items-center gap-2">
							<span className="w-6 shrink-0 text-right font-mono text-muted-foreground">
								{anchor ? `${step.sequenceNumber}.` : '·'}
							</span>
							<span className="min-w-0 flex-1 truncate text-foreground">
								{step.stepName}
							</span>
							{/* The same square the session above uses for Report and Stop, at the same
							    32px. It was a labelled `Console` button, which put a 78px pill on
							    every step row directly beneath a rail of icon squares — the child
							    action reading as the more prominent one, and each row's step name
							    truncating that much earlier to pay for it. The label moves to the
							    tooltip and the accessible name, both of which name the step. */}
							{step.runId ? (
								<IconButton
									aria-pressed={selected}
									ariaLabel={`Show step ${step.stepName} run in Live Console`}
									className="shrink-0 sm:h-8 sm:w-8"
									onClick={() => onSelectRun(step.runId ?? '')}
									title="Show in Live Console"
									variant={selected ? 'primary' : 'secondary'}>
									<Terminal aria-hidden="true" className="h-3.5 w-3.5" />
								</IconButton>
							) : null}
						</div>
						<div className="mt-1 flex flex-wrap items-center gap-1.5 pl-8 text-muted-foreground">
							<Badge tone="neutral">{stepTypeLabel(step.stepType)}</Badge>
							<Badge tone={sessionStatusTone(step.status)}>
								{stepStatusLabel(step.status)}
							</Badge>
							{step.executionIdentity ? (
								<ExecutionIdentityBadges
									{...step.executionIdentity}
									variant="compact"
								/>
							) : null}
							<span className="whitespace-nowrap tabular-nums">
								{formatActiveDuration(step.durationMs, step.startedAt, now)}
							</span>
						</div>
						{step.errorMessage && (
							<FailureReason className="pl-8" message={step.errorMessage} />
						)}
					</li>
				);
			})}
		</ol>
	);
}
