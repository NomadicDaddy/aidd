import { useState } from 'react';
import { Link } from 'react-router';

import type { RunRecord } from '../../../api/types.ts';

import { ExecutionIdentityBadges } from '../../../components/shared/ExecutionIdentityBadges.tsx';
import { OverflowScroller } from '../../../components/shared/OverflowScroller.tsx';
import { RunCommandInfo } from '../../../components/shared/RunCommandInfo.tsx';
import { SortableColumnHeader } from '../../../components/shared/SortableColumnHeader.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { buttonClassName } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { useNow } from '../../../hooks/useNow.ts';
import { useViewportFill, viewportFillScrollerClass } from '../../../hooks/useViewportFill.ts';
import { formatActiveDuration, formatDate, humanizeEnum } from '../../../lib/formatters.ts';
import {
	interactiveTableRowClass,
	tableColumnClass,
	tableHeadClass,
} from '../../../lib/tableStyles.ts';
import { toneText } from '../../../lib/tones.ts';
import { touchTargetTextClass } from '../../../lib/touchTarget.ts';
import { RunLivenessIndicator } from '../../runs/RunLivenessIndicator.tsx';
import { runSourceLabel } from '../../runs/runRowUtils.ts';
import { classifyRunRecord } from '../../runs/runsUtils.ts';

function sourceTone(run: RunRecord): 'amber' | 'neutral' | 'teal' {
	if (run.source === 'cli') return 'teal';
	if (run.source === 'director') return 'amber';
	return 'neutral';
}

function RunStatusBadge({ run }: { run: RunRecord }) {
	const outcome = classifyRunRecord(run);
	return (
		<Badge showDot title={outcome.title} tone={outcome.tone}>
			{outcome.label}
		</Badge>
	);
}

type ActiveRunSortKey = 'duration' | 'started';

export function ActiveRunsPanel({
	isError,
	isLoading,
	projectPath,
	runs,
}: {
	isError: boolean;
	isLoading: boolean;
	projectPath: string;
	runs: RunRecord[];
}) {
	const [sort, setSort] = useState<{
		direction: 'asc' | 'desc';
		key: ActiveRunSortKey;
	}>({ direction: 'desc', key: 'started' });
	const orderedRuns = runs.toSorted((left, right) => {
		const leftValue = sort.key === 'started' ? left.startedAt : (left.durationMs ?? 0);
		const rightValue = sort.key === 'started' ? right.startedAt : (right.durationMs ?? 0);
		return sort.direction === 'asc' ? leftValue - rightValue : rightValue - leftValue;
	});
	const tableRef = useViewportFill<HTMLDivElement>({ refreshKey: orderedRuns });
	function toggleSort(key: ActiveRunSortKey): void {
		setSort((current) => ({
			direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
			key,
		}));
	}
	// 1s clock so a running run's elapsed duration advances in realtime, instead of only
	// re-computing when the ~15s websocket broadcast re-renders this panel. Scoped here and gated
	// on an actually-running run so completed-only lists don't tick needlessly.
	const now = useNow(orderedRuns.some((run) => run.status === 'running'));
	// One message, rendered by whichever half is on screen. A colSpan={6} table row alone would
	// leave the card stack, which has no equivalent, without it.
	const placeholder = isLoading
		? 'Loading active runs…'
		: isError
			? 'Unable to load active runs.'
			: runs.length === 0
				? 'No active runs for this project.'
				: null;
	const placeholderClass = isError ? toneText.red : 'text-muted-foreground';
	function liveConsoleHref(runId: string): string {
		return `/runs?project=${encodeURIComponent(projectPath)}&run=${encodeURIComponent(runId)}`;
	}
	return (
		<Card className={`overflow-hidden p-0 ${tableColumnClass}`}>
			<CardHeader
				className="mb-0 border-b border-border px-4 py-3"
				description="Currently running aidd work for this project from UI launches and CLI sessions."
				headingLevel={3}
				status={
					<span className="text-xs text-muted-foreground tabular-nums">
						{runs.length} active {runs.length === 1 ? 'run' : 'runs'}
					</span>
				}
				title="Active runs"
			/>
			{/* The house pair from UnifiedExecutionTable: an xl:-gated scroller for the six-column
			    table, and a card stack below it. The table alone sat in this Card's own
			    `overflow-hidden`, so at 390px the Action cell holding "Open in Live Console" was
			    clipped past the card edge with no scroll to recover it — the link was unreachable
			    by any gesture rather than merely off-screen. */}
			<OverflowScroller
				ariaLabel="Active project runs"
				className="hidden xl:block"
				rootRef={tableRef}
				scrollerClassName={viewportFillScrollerClass}>
				<table aria-label="Active project runs" className="w-full text-left text-sm">
					<colgroup>
						<col className="w-[18%]" />
						<col />
						<col className="w-[16%]" />
						<col className="w-28" />
						<col className="w-52" />
					</colgroup>
					<thead className={tableHeadClass}>
						<tr>
							<SortableColumnHeader
								activeDir={sort.direction}
								activeKey={sort.key}
								className="px-4 py-3"
								label="Started"
								onSort={toggleSort}
								sortKey="started"
							/>
							<th className="px-4 py-3" scope="col">
								Execution target
							</th>
							<th className="px-4 py-3" scope="col">
								Result
							</th>
							<SortableColumnHeader
								activeDir={sort.direction}
								activeKey={sort.key}
								className="px-4 py-3"
								label="Duration"
								onSort={toggleSort}
								sortKey="duration"
							/>
							<th className="px-4 py-3 text-right" scope="col">
								Action
							</th>
						</tr>
					</thead>
					<tbody>
						{placeholder === null ? null : (
							<tr>
								<td className={`px-4 py-4 ${placeholderClass}`} colSpan={5}>
									{placeholder}
								</td>
							</tr>
						)}
						{orderedRuns.map((run) => (
							<tr
								className={`border-b border-border last:border-0 ${interactiveTableRowClass}`}
								key={run.id}>
								<td className="px-4 py-3">{formatDate(run.startedAt)}</td>
								<td className="px-4 py-3">
									<div className="flex min-w-0 items-center gap-1.5">
										<Link
											aria-label={`Open run ${run.id} in Live Console`}
											className={`font-mono text-xs text-foreground hover:underline ${touchTargetTextClass}`}
											to={liveConsoleHref(run.id)}>
											{run.id}
										</Link>
										<RunCommandInfo
											command={run.launchCommand}
											runId={run.id}
										/>
									</div>
									<div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
										<Badge tone={sourceTone(run)}>{runSourceLabel(run)}</Badge>
										<Badge tone="neutral">{humanizeEnum(run.mode)}</Badge>
										<ExecutionIdentityBadges
											backend={run.backend}
											model={run.model}
											provider={run.provider}
											reasoningEffort={run.reasoningEffort}
											variant="compact"
										/>
									</div>
								</td>
								<td className="px-4 py-3">
									<RunStatusBadge run={run} />
									<RunLivenessIndicator now={now} run={run} />
								</td>
								<td className="px-4 py-3">
									{formatActiveDuration(run.durationMs, run.startedAt, now)}
								</td>
								<td className="px-4 py-3 text-right">
									<Link
										aria-label={`Open run ${run.id} in Live Console`}
										className={buttonClassName(
											run.status === 'running' ? 'primary' : 'secondary',
											undefined,
											'compact',
										)}
										to={liveConsoleHref(run.id)}>
										Open in Live Console
									</Link>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</OverflowScroller>
			<div
				aria-label="Active project runs"
				className="flex flex-col divide-y divide-border xl:hidden"
				role="list">
				{placeholder === null ? null : (
					<p className={`px-4 py-4 text-sm ${placeholderClass}`}>{placeholder}</p>
				)}
				{orderedRuns.map((run) => (
					<div className="flex flex-col gap-2 px-4 py-3" key={run.id} role="listitem">
						<div className="flex min-w-0 items-center gap-1.5">
							<Link
								aria-label={`Open run ${run.id} in Live Console`}
								className={`min-w-0 truncate font-mono text-xs text-foreground hover:underline ${touchTargetTextClass}`}
								to={liveConsoleHref(run.id)}>
								{run.id}
							</Link>
							<RunCommandInfo command={run.launchCommand} runId={run.id} />
						</div>
						<div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
							<RunStatusBadge run={run} />
							<Badge tone={sourceTone(run)}>{runSourceLabel(run)}</Badge>
							<Badge tone="neutral">{humanizeEnum(run.mode)}</Badge>
							<span className="inline-flex whitespace-nowrap">
								{formatDate(run.startedAt)}
								<span aria-hidden="true" className="px-1.5">
									·
								</span>
								{formatActiveDuration(run.durationMs, run.startedAt, now)}
							</span>
						</div>
						<RunLivenessIndicator now={now} run={run} />
						<div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
							<ExecutionIdentityBadges
								backend={run.backend}
								model={run.model}
								provider={run.provider}
								reasoningEffort={run.reasoningEffort}
							/>
						</div>
						<div>
							<Link
								aria-label={`Open run ${run.id} in Live Console`}
								className={buttonClassName(
									run.status === 'running' ? 'primary' : 'secondary',
									undefined,
									'compact',
								)}
								to={liveConsoleHref(run.id)}>
								Open in Live Console
							</Link>
						</div>
					</div>
				))}
			</div>
		</Card>
	);
}
