import { Link } from 'react-router';

import type { RunRecord } from '../../../api/types.ts';

import { ExecutionIdentityBadges } from '../../../components/shared/ExecutionIdentityBadges.tsx';
import { OverflowScroller } from '../../../components/shared/OverflowScroller.tsx';
import { RunCommandInfo } from '../../../components/shared/RunCommandInfo.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { buttonClassName } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { useNow } from '../../../hooks/useNow.ts';
import { formatActiveDuration, formatDate } from '../../../lib/formatters.ts';
import { toneText } from '../../../lib/tones.ts';
import { touchTargetTextClass } from '../../../lib/touchTarget.ts';
import { tableMeasureClass } from '../../../lib/typography.ts';
import { runRuntimeDetail, runSourceLabel } from '../../runs/runRowUtils.ts';

function statusTone(status: RunRecord['status']): 'amber' | 'emerald' | 'neutral' | 'red' {
	if (status === 'completed') return 'emerald';
	if (status === 'running') return 'amber';
	if (status === 'failed' || status === 'killed') return 'red';
	return 'neutral';
}

function sourceTone(run: RunRecord): 'amber' | 'neutral' | 'teal' {
	if (run.source === 'cli') return 'teal';
	if (run.source === 'director') return 'amber';
	return 'neutral';
}

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
	// 1s clock so a running run's elapsed duration advances in realtime, instead of only
	// re-computing when the ~15s websocket broadcast re-renders this panel. Scoped here and gated
	// on an actually-running run so completed-only lists don't tick needlessly.
	const now = useNow(runs.some((run) => run.status === 'running'));
	// One message, rendered by whichever half is on screen. It used to exist only as a colSpan={6}
	// table row, which the card stack has no equivalent of.
	const placeholder = isLoading
		? 'Loading recent runs...'
		: isError
			? 'Unable to load recent runs.'
			: runs.length === 0
				? 'No recent runs for this project.'
				: null;
	const placeholderClass = isError ? toneText.red : 'text-muted-foreground';
	function liveConsoleHref(runId: string): string {
		return `/runs?project=${encodeURIComponent(projectPath)}&run=${encodeURIComponent(runId)}`;
	}
	return (
		<Card className="overflow-hidden p-0">
			<CardHeader
				className="mb-0 border-b border-border px-4 py-3"
				description="Recent aidd runs for this project from UI launches and CLI sessions (last 24 h)."
				title="Recent runs"
			/>
			{/* The house pair from UnifiedExecutionTable: an xl:-gated scroller for the six-column
			    table, and a card stack below it. The table alone sat in this Card's own
			    `overflow-hidden`, so at 390px the Action cell holding "Open in Live Console" was
			    clipped past the card edge with no scroll to recover it — the link was unreachable
			    by any gesture rather than merely off-screen. */}
			<OverflowScroller ariaLabel="Recent project runs" className="hidden xl:block">
				<table
					aria-label="Recent project runs"
					className={`w-full text-left text-sm ${tableMeasureClass}`}>
					<thead className="border-b border-border bg-muted text-xs text-muted-foreground uppercase">
						<tr>
							<th className="px-4 py-3" scope="col">
								Run
							</th>
							<th className="px-4 py-3" scope="col">
								Mode
							</th>
							<th className="px-4 py-3" scope="col">
								Status
							</th>
							<th className="px-4 py-3" scope="col">
								Started
							</th>
							<th className="px-4 py-3" scope="col">
								Duration
							</th>
							<th className="px-4 py-3 text-right" scope="col">
								Action
							</th>
						</tr>
					</thead>
					<tbody>
						{placeholder === null ? null : (
							<tr>
								<td className={`px-4 py-4 ${placeholderClass}`} colSpan={6}>
									{placeholder}
								</td>
							</tr>
						)}
						{runs.map((run) => (
							<tr className="border-b border-border last:border-0" key={run.id}>
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
										<ExecutionIdentityBadges
											backend={run.backend}
											model={run.model}
											provider={run.provider}
											reasoningEffort={run.reasoningEffort}
										/>
										<span>{runRuntimeDetail(run)}</span>
									</div>
								</td>
								<td className="px-4 py-3">{run.mode}</td>
								<td className="px-4 py-3">
									<Badge tone={statusTone(run.status)}>{run.status}</Badge>
								</td>
								<td className="px-4 py-3">{formatDate(run.startedAt)}</td>
								<td className="px-4 py-3">
									{formatActiveDuration(run.durationMs, run.startedAt, now)}
								</td>
								<td className="px-4 py-3 text-right">
									<Link
										aria-label={`Open run ${run.id} in Live Console`}
										className={buttonClassName('primary', undefined, 'compact')}
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
				aria-label="Recent project runs"
				className="flex flex-col divide-y divide-border xl:hidden"
				role="list">
				{placeholder === null ? null : (
					<p className={`px-4 py-4 text-sm ${placeholderClass}`}>{placeholder}</p>
				)}
				{runs.map((run) => (
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
							<Badge tone={statusTone(run.status)}>{run.status}</Badge>
							<Badge tone={sourceTone(run)}>{runSourceLabel(run)}</Badge>
							<span className="capitalize">{run.mode}</span>
							<span>{formatDate(run.startedAt)}</span>
							<span aria-hidden="true">·</span>
							<span>{formatActiveDuration(run.durationMs, run.startedAt, now)}</span>
						</div>
						<div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
							<ExecutionIdentityBadges
								backend={run.backend}
								model={run.model}
								provider={run.provider}
								reasoningEffort={run.reasoningEffort}
							/>
							<span>{runRuntimeDetail(run)}</span>
						</div>
						<div>
							<Link
								aria-label={`Open run ${run.id} in Live Console`}
								className={buttonClassName('primary', undefined, 'compact')}
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
