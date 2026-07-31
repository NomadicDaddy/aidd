import { Link } from 'react-router';

import type {
	ProjectLocalIteration,
	ProjectLocalRun,
	ProjectUsageSummary,
	RunRecord,
} from '../../../api/types.ts';

import { ExecutionIdentityBadges } from '../../../components/shared/ExecutionIdentityBadges.tsx';
import { LocalAiddHistoryPanel } from '../../../components/shared/LocalAiddHistoryPanel.tsx';
import { RunCommandInfo } from '../../../components/shared/RunCommandInfo.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { buttonClassName } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { useNow } from '../../../hooks/useNow.ts';
import { useRuns } from '../../../hooks/useRuns.ts';
import { formatActiveDuration, formatDate } from '../../../lib/formatters.ts';
import { runRuntimeDetail, runSourceLabel } from '../../runs/runRowUtils.ts';
import { compareRunsByLiveness } from '../../runs/runsUtils.ts';
import { ProjectUsagePanel } from './ProjectUsagePanel.tsx';

function statusTone(status: RunRecord['status']): 'amber' | 'emerald' | 'neutral' | 'red' {
	if (status === 'completed') return 'emerald';
	if (status === 'running') return 'amber';
	if (status === 'failed' || status === 'killed') return 'red';
	return 'neutral';
}

function ActiveRunsPanel({
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
	return (
		<Card className="overflow-hidden p-0">
			<div className="border-b px-4 py-3 dark:border-neutral-800">
				<h2 className="text-sm font-semibold text-foreground">Recent runs</h2>
				<p className="text-xs text-neutral-500">
					Recent aidd runs for this project from UI launches and CLI sessions (last 24 h).
				</p>
			</div>
			<table aria-label="Recent project runs" className="w-full text-left text-sm">
				<thead className="border-b bg-neutral-50 text-xs text-neutral-500 uppercase dark:border-neutral-800 dark:bg-neutral-900">
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
					{isLoading ? (
						<tr>
							<td className="px-4 py-4 text-neutral-500" colSpan={6}>
								Loading recent runs...
							</td>
						</tr>
					) : null}
					{isError ? (
						<tr>
							<td className="px-4 py-4 text-red-600" colSpan={6}>
								Unable to load recent runs.
							</td>
						</tr>
					) : null}
					{!isLoading && !isError && runs.length === 0 ? (
						<tr>
							<td className="px-4 py-4 text-neutral-500" colSpan={6}>
								No recent runs for this project.
							</td>
						</tr>
					) : null}
					{runs.map((run) => {
						const liveConsoleHref = `/runs?project=${encodeURIComponent(projectPath)}&run=${encodeURIComponent(run.id)}`;
						return (
							<tr
								className="border-b last:border-0 dark:border-neutral-800"
								key={run.id}>
								<td className="px-4 py-3">
									<div className="flex min-w-0 items-center gap-1.5">
										<Link
											aria-label={`Open run ${run.id} in Live Console`}
											className="font-mono text-xs text-neutral-900 hover:underline dark:text-neutral-100"
											to={liveConsoleHref}>
											{run.id}
										</Link>
										<RunCommandInfo
											command={run.launchCommand}
											runId={run.id}
										/>
									</div>
									<div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
										<Badge
											tone={
												run.source === 'cli'
													? 'teal'
													: run.source === 'director'
														? 'amber'
														: 'neutral'
											}>
											{runSourceLabel(run)}
										</Badge>
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
										to={liveConsoleHref}>
										Open in Live Console
									</Link>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</Card>
	);
}

export function RunsTab({
	localIterations,
	localRuns,
	projectPath,
	usage,
}: {
	localIterations: ProjectLocalIteration[];
	localRuns: ProjectLocalRun[];
	projectPath: string;
	usage: ProjectUsageSummary;
}) {
	const activeRuns = useRuns(projectPath);
	const runList = (activeRuns.data?.pages.flatMap((page) => page.runs) ?? [])
		.slice()
		.sort(compareRunsByLiveness);
	const localTotal = localIterations.length;
	const localRunTotal = localRuns.length;
	if (
		localTotal === 0 &&
		localRunTotal === 0 &&
		!activeRuns.isLoading &&
		!activeRuns.isError &&
		runList.length === 0
	) {
		return (
			<div className="space-y-4">
				<ProjectUsagePanel usage={usage} />
				<ActiveRunsPanel
					isError={activeRuns.isError}
					isLoading={activeRuns.isLoading}
					projectPath={projectPath}
					runs={runList}
				/>
				<Card className="py-10 text-center text-sm text-neutral-500">
					<p>No runs recorded for this project.</p>
					<p className="mt-1 text-xs">
						Launch a run from the{' '}
						<Link
							className="underline"
							to={`/runs?project=${encodeURIComponent(projectPath)}`}>
							Runs page
						</Link>{' '}
						to see history here.
					</p>
				</Card>
			</div>
		);
	}
	return (
		<div className="space-y-4">
			<ProjectUsagePanel usage={usage} />
			<ActiveRunsPanel
				isError={activeRuns.isError}
				isLoading={activeRuns.isLoading}
				projectPath={projectPath}
				runs={runList}
			/>
			<LocalAiddHistoryPanel
				description="Rows read from the project's `.aidd/runs.jsonl` and `.aidd/iterations` metadata."
				iterations={localIterations}
				runs={localRuns}
			/>
		</div>
	);
}
