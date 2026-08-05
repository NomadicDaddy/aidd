import { default as Activity } from 'lucide-react/dist/esm/icons/activity';
import { default as ArrowRight } from 'lucide-react/dist/esm/icons/arrow-right';
import { Link } from 'react-router';

import type { RunRecord } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { ExecutionIdentityBadges } from '../../components/shared/ExecutionIdentityBadges.tsx';
import { SkeletonLines } from '../../components/shared/LoadingState.tsx';
import { RunCommandInfo } from '../../components/shared/RunCommandInfo.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { buttonClassName } from '../../components/ui/button.tsx';
import { Card, CardHeader, cardHeaderLinkClass } from '../../components/ui/card.tsx';
import { formatDate } from '../../lib/formatters.ts';
import { toneText } from '../../lib/tones.ts';
import { runSourceLabel } from '../runs/runRowUtils.ts';

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
			<CardHeader
				action={
					<Link className={cardHeaderLinkClass} to="/runs">
						Runs
						<ArrowRight className="h-3.5 w-3.5" />
					</Link>
				}
				badge={
					<Badge showDot tone={activeRuns.length > 0 ? 'amber' : 'emerald'}>
						{activeRuns.length}
					</Badge>
				}
				icon={<Activity className={`h-4 w-4 ${toneText.amber}`} />}
				title="Active Runs"
			/>
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
								<div className="truncate text-sm font-medium text-foreground">
									{run.projectName}
								</div>
								<RunCommandInfo command={run.launchCommand} runId={run.id} />
							</div>
							<div className="truncate text-xs text-muted-foreground">
								{runSourceLabel(run)} / {run.mode} / started{' '}
								{formatDate(run.startedAt)}
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
