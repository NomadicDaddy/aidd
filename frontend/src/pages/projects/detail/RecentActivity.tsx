import { Link } from 'react-router';

import type { ProjectMetadata } from '../../../api/types.ts';

import { ExecutionIdentityBadges } from '../../../components/shared/ExecutionIdentityBadges.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { formatRelativeAge } from '../../../lib/formatters.ts';
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
			<div className="mb-1.5 flex items-center justify-between">
				<h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
				<Link
					className="text-xs text-muted-foreground hover:underline"
					to={`/runs?project=${encodeURIComponent(projectPath)}`}>
					View all runs
				</Link>
			</div>
			{projectRuns.length === 0 ? (
				<p className="text-sm text-muted-foreground">No runs recorded for this project.</p>
			) : (
				<ul aria-label="Recent project activity" className="space-y-1.5 text-sm">
					{projectRuns.map((run) => (
						<li className="rounded-md border border-border px-2.5 py-1" key={run.id}>
							<div className="flex flex-wrap items-start justify-between gap-2">
								<div className="min-w-0">
									<div className="flex flex-wrap items-center gap-2">
										<Badge tone={runStatusTone(run.status)}>{run.status}</Badge>
										<span className="font-medium text-foreground">
											{run.title}
										</span>
									</div>
									{run.executionIdentity ? (
										<ExecutionIdentityBadges
											{...run.executionIdentity}
											className="mt-1"
										/>
									) : null}
									{run.detailParts.length > 0 ? (
										<div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
											{run.detailParts.map((part) => (
												<span key={part}>{part}</span>
											))}
											<span>{run.traceLabel}</span>
										</div>
									) : (
										<div className="mt-1 text-xs text-muted-foreground">
											{run.traceLabel}
										</div>
									)}
								</div>
								<span className="shrink-0 text-xs text-muted-foreground">
									{formatRelativeAge(run.timestamp)}
								</span>
							</div>
						</li>
					))}
				</ul>
			)}
		</Card>
	);
}
