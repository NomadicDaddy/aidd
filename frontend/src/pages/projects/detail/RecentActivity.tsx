import { Link } from 'react-router';

import type { ProjectMetadata } from '../../../api/types.ts';

import { ExecutionIdentityBadges } from '../../../components/shared/ExecutionIdentityBadges.tsx';
import { RelativeAge } from '../../../components/shared/RelativeAge.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { touchTargetTextClass } from '../../../lib/touchTarget.ts';
import { recentMetadataActivity } from './recentActivityItems.ts';
import { RECENT_ACTIVITY_LIMIT, runStatusTone } from './shared.ts';

export function RecentActivity({
	metadata,
	projectPath,
}: {
	metadata: ProjectMetadata;
	projectPath: string;
}) {
	const projectRuns = recentMetadataActivity(metadata.localRuns, metadata.localIterations).slice(
		0,
		RECENT_ACTIVITY_LIMIT,
	);
	return (
		<Card className="p-2.5">
			<CardHeader
				action={
					<Link
						className={`text-xs text-muted-foreground hover:underline ${touchTargetTextClass}`}
						to={`/runs?project=${encodeURIComponent(projectPath)}`}>
						View all runs
					</Link>
				}
				className="mb-1.5"
				title="Recent activity"
			/>
			{projectRuns.length === 0 ? (
				<p className="text-sm text-muted-foreground">No runs recorded for this project.</p>
			) : (
				<ul aria-label="Recent project activity" className="space-y-1.5 text-sm">
					{projectRuns.map((run) => (
						// Two lines, not six. The run id used to get its own body line, where a
						// full UUID was the most prominent thing after the title and the least
						// readable; it is now the title's tooltip, matching how RunsTab carries it.
						<li className="rounded-md border border-border px-2.5 py-1" key={run.id}>
							<div className="flex flex-wrap items-baseline justify-between gap-x-2">
								<div className="flex min-w-0 flex-wrap items-center gap-2">
									<Badge tone={runStatusTone(run.status)}>{run.status}</Badge>
									<span
										className="font-medium text-foreground"
										title={run.traceLabel}>
										{run.title}
									</span>
								</div>
								<span className="shrink-0 text-xs text-muted-foreground">
									<RelativeAge value={run.timestamp} />
								</span>
							</div>
							<div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
								{run.executionIdentity ? (
									<ExecutionIdentityBadges {...run.executionIdentity} />
								) : null}
								{run.detailParts.map((part) => (
									<span key={part}>{part}</span>
								))}
							</div>
						</li>
					))}
				</ul>
			)}
		</Card>
	);
}
