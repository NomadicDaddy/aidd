import { default as Activity } from 'lucide-react/dist/esm/icons/activity';
import { default as ArrowRight } from 'lucide-react/dist/esm/icons/arrow-right';
import { Link } from 'react-router-dom';

import type { RunRecord } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { ExecutionIdentityBadges } from '../../components/shared/ExecutionIdentityBadges.tsx';
import { SkeletonLines } from '../../components/shared/LoadingState.tsx';
import { RunCommandInfo } from '../../components/shared/RunCommandInfo.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { buttonClassName } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { formatDate } from '../../lib/formatters.ts';

export function ActiveRunsCard({
	activeRuns,
	isLoading,
	runList,
}: {
	activeRuns: RunRecord[];
	isLoading: boolean;
	runList: RunRecord[];
}) {
	return (
		<Card className="overflow-hidden" variant="panel">
			<div className="mb-4 flex items-center justify-between gap-3">
				<div className="text-foreground flex items-center gap-2 text-sm font-semibold">
					<Activity className="h-4 w-4 text-amber-600 dark:text-amber-300" />
					Active Runs
					<Badge showDot tone={activeRuns.length > 0 ? 'amber' : 'emerald'}>
						{activeRuns.length}
					</Badge>
				</div>
				<Link
					className="focus-visible:ring-ring/50 focus-visible:ring-offset-background inline-flex items-center gap-1 rounded-md text-sm font-medium text-teal-700 transition-colors outline-none hover:text-teal-900 focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-teal-300 dark:hover:text-teal-100"
					to="/runs">
					Runs
					<ArrowRight className="h-3.5 w-3.5" />
				</Link>
			</div>
			<div className="space-y-2">
				{isLoading && runList.length === 0 ? (
					<SkeletonLines count={4} label="Loading active runs…" />
				) : null}
				{!isLoading && activeRuns.length === 0 && (
					<EmptyState
						action={
							<Link className={buttonClassName('secondary')} to="/runs">
								Launch a run
								<ArrowRight className="h-3.5 w-3.5" />
							</Link>
						}>
						No active runs.
					</EmptyState>
				)}
				{activeRuns.slice(0, 4).map((run) => (
					<div
						className="grid grid-cols-[1fr_auto] gap-3 rounded-lg border border-amber-200/80 bg-amber-50/70 p-3 transition-colors hover:border-amber-300/80 dark:border-amber-900/60 dark:bg-amber-950/20 dark:hover:border-amber-800/70"
						key={run.id}>
						<div className="min-w-0">
							<div className="flex min-w-0 items-center gap-1.5">
								<div className="text-foreground truncate text-sm font-medium">
									{run.projectName}
								</div>
								<RunCommandInfo command={run.launchCommand} runId={run.id} />
							</div>
							<div className="text-muted-foreground truncate text-xs">
								{run.source === 'cli'
									? 'CLI'
									: run.source === 'director'
										? 'Coord'
										: 'Web'}{' '}
								/ {run.mode} / started {formatDate(run.startedAt)}
							</div>
							<ExecutionIdentityBadges
								backend={run.backend}
								className="mt-1"
								model={run.model}
								provider={run.provider}
								reasoningEffort={run.reasoningEffort}
							/>
						</div>
						<Badge pulse showDot tone="amber">
							{run.status}
						</Badge>
					</div>
				))}
			</div>
		</Card>
	);
}
