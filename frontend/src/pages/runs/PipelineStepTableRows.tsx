import { default as CircleDashed } from 'lucide-react/dist/esm/icons/circle-dashed';
import { default as Terminal } from 'lucide-react/dist/esm/icons/terminal';

import { ExecutionIdentityBadges } from '../../components/shared/ExecutionIdentityBadges.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { cn } from '../../lib/cn.ts';
import { formatActiveDuration } from '../../lib/formatters.ts';
import { stepTypeLabel } from '../../lib/stepTypeLabel.ts';
import { FailureReason } from './FailureReason.tsx';
import { sessionStatusTone, stepStatusLabel } from './pipelineSessionStatus.ts';
import { stepIndentPx, usePipelineStepSubRows } from './pipelineStepSubRowModel.ts';
import { containerSelectedClass } from './runRowUtils.ts';

const cellClass = 'px-3 py-2 align-top text-xs';
const nameCellClass = 'max-w-0 py-2 pr-3 align-top text-xs';

function NoticeRow({ children }: { children: string }) {
	return (
		<tr className="border-b bg-muted/60 last:border-0">
			<td className="px-4 py-3 text-xs text-muted-foreground" colSpan={7}>
				{children}
			</td>
		</tr>
	);
}

/**
 * The steps of an expanded pipeline session, as rows of the table they belong to.
 *
 * Not one `colSpan={7}` cell containing a private CSS grid whose columns restate the parent's
 * `<colgroup>` percentages as `fr` units. Restating them is the bug: the parent and its cells
 * carry their own sizing and asymmetric padding, so the two column systems agree only by hand and
 * drift apart the moment either side is touched — a step's KIND badge sitting over the gap between
 * the parent's KIND and MODEL columns. Real `<tr>` elements take the parent's widths by
 * construction; there is nothing to keep in sync.
 *
 * Deliberately lighter than the report page's ExecutedStepRow: no per-step consoles (a WebSocket
 * console per step inside a table is a performance hazard) — a step with a run selects that run in
 * the page's shared Live Console instead. The report link on the session row stays the full-detail
 * surface.
 */
export function PipelineStepTableRows({
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
	if (notice !== null) return <NoticeRow>{notice}</NoticeRow>;
	return (
		<>
			{rows.map((row) => {
				if (row.kind === 'pending') {
					return (
						<tr
							className="border-b bg-muted/60 text-muted-foreground last:border-0"
							key={`pending-${row.sequenceNumber}`}>
							<td
								className={nameCellClass}
								style={{ paddingLeft: `${stepIndentPx(0)}px` }}>
								<div className="flex min-w-0 items-center gap-2">
									<span className="w-6 shrink-0 text-right font-mono">
										{row.sequenceNumber}.
									</span>
									<span className="truncate">{row.step.name}</span>
								</div>
							</td>
							<td className={cellClass} />
							<td className={cellClass}>
								<Badge tone="neutral">{stepTypeLabel(row.step.stepType)}</Badge>
							</td>
							<td className={cellClass}>—</td>
							<td className={cellClass}>
								<Badge tone="neutral">
									<CircleDashed aria-hidden="true" className="h-3 w-3" />
									Pending
								</Badge>
							</td>
							<td className={cellClass}>—</td>
							<td className="py-2 pr-4 pl-3 align-top text-xs">—</td>
						</tr>
					);
				}
				const step = row.result;
				const anchor = step.depth === 0 && step.phase === 'step';
				const selected = step.runId !== null && step.runId === selectedRunId;
				return (
					<tr
						aria-current={selected ? 'true' : undefined}
						className={cn(
							'border-b text-xs last:border-0',
							selected ? containerSelectedClass : 'bg-muted/60',
						)}
						key={step.id}>
						<td
							className={nameCellClass}
							style={{ paddingLeft: `${stepIndentPx(step.depth)}px` }}>
							<div className="flex min-w-0 items-center gap-2">
								<span className="w-6 shrink-0 text-right font-mono text-muted-foreground">
									{anchor ? `${step.sequenceNumber}.` : '·'}
								</span>
								<span className="truncate text-foreground">{step.stepName}</span>
							</div>
						</td>
						<td className={cellClass} />
						<td className={cellClass}>
							<Badge tone="neutral">{stepTypeLabel(step.stepType)}</Badge>
						</td>
						<td className={cellClass}>
							{step.executionIdentity ? (
								// Same column budget as the session row above it, same variant.
								<ExecutionIdentityBadges
									{...step.executionIdentity}
									compactReasoningLabel
									variant="compact"
								/>
							) : (
								<span className="text-muted-foreground">—</span>
							)}
						</td>
						<td className={cn(cellClass, 'min-w-0')}>
							<Badge tone={sessionStatusTone(step.status)}>
								{stepStatusLabel(step.status)}
							</Badge>
							{/* The same badge the report page shows. Without it two rows with the
							    same name and different outcomes read as one step contradicting
							    itself rather than as two attempts at it. */}
							{row.attemptLabel ? (
								<Badge tone="amber">{row.attemptLabel}</Badge>
							) : null}
							{step.errorMessage && <FailureReason message={step.errorMessage} />}
						</td>
						<td
							className={cn(
								cellClass,
								'whitespace-nowrap text-muted-foreground tabular-nums',
							)}>
							{formatActiveDuration(step.durationMs, step.startedAt, now)}
						</td>
						<td className="py-2 pr-4 pl-3 align-top text-xs">
							{step.runId ? (
								<Button
									aria-label={`Show step ${step.stepName} run in Live Console`}
									aria-pressed={selected}
									onClick={() => onSelectRun(step.runId ?? '')}
									size="compact"
									title="Show in Live Console"
									variant={selected ? 'primary' : 'secondary'}>
									<Terminal aria-hidden="true" className="h-3 w-3" />
									Console
								</Button>
							) : (
								<span className="text-muted-foreground">—</span>
							)}
						</td>
					</tr>
				);
			})}
		</>
	);
}
