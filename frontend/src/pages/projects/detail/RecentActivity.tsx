import { Link } from 'react-router';

import type { ProjectMetadata } from '../../../api/types.ts';

import { ExecutionIdentityBadges } from '../../../components/shared/ExecutionIdentityBadges.tsx';
import { RelativeAge } from '../../../components/shared/RelativeAge.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Card, CardHeader, cardHeaderLinkClass } from '../../../components/ui/card.tsx';
import { toneText } from '../../../lib/tones.ts';
import { touchTargetTextClass } from '../../../lib/touchTarget.ts';
import { MetadataRow } from './MetadataRow.tsx';
import { projectDetailTabSearch } from './overviewLinks.ts';
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
		<Card>
			<CardHeader
				action={
					<Link
						className={cardHeaderLinkClass}
						to={`/runs?project=${encodeURIComponent(projectPath)}`}>
						View all runs
					</Link>
				}
				className="mb-3"
				headingLevel={3}
				title="Recent activity"
			/>
			<div className="mb-2 divide-y divide-border border-y border-border">
				<MetadataRow
					label="aidd state"
					link={{
						ariaLabel: `aidd state: ${metadata.sync.syncState}. View runs.`,
						to: projectDetailTabSearch('runs'),
					}}
					value={<Badge>{metadata.sync.syncState}</Badge>}
				/>
				<MetadataRow
					label="Last-used target"
					value={
						<div className="flex flex-wrap items-center justify-end gap-2">
							<ExecutionIdentityBadges
								backend={metadata.sync.preferredCli}
								model={metadata.sync.preferredModel}
								provider={metadata.sync.preferredProvider}
								reasoningEffort={metadata.sync.preferredReasoningEffort}
							/>
							<Link
								aria-label="View runs for the last-used launch target."
								className={`text-accent hover:underline ${touchTargetTextClass}`}
								to={projectDetailTabSearch('runs')}>
								Runs
							</Link>
						</div>
					}
				/>
			</div>
			{metadata.sync.lastSyncError ? (
				<p className={`mb-2 text-xs ${toneText.red}`}>{metadata.sync.lastSyncError}</p>
			) : null}
			{projectRuns.length === 0 ? (
				<p className="text-sm text-muted-foreground">No runs recorded for this project.</p>
			) : (
				<ul aria-label="Recent project activity" className="divide-y divide-border text-sm">
					{projectRuns.map((run) => (
						// Two lines, not six. The run id is the title's tooltip, matching how RunsTab
						// carries it: on a body line of its own a full UUID is the most prominent
						// thing after the title and the least readable.
						<li className="group px-3 py-2" key={run.id}>
							<div className="flex flex-wrap items-baseline justify-between gap-x-2">
								<div className="flex min-w-0 flex-wrap items-center gap-2">
									{/* The label, not the enum: `no_work` and `stop_requested` were the
								    two raw snake_case values reaching a badge. */}
									<Badge tone={runStatusTone(run.status)}>
										{run.statusLabel}
									</Badge>
									<span
										className="font-medium text-foreground group-hover:text-accent"
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
							{run.summary ? (
								<p
									className="mt-1 line-clamp-2 text-xs text-muted-foreground"
									title={run.summary}>
									{run.summary}
								</p>
							) : null}
						</li>
					))}
				</ul>
			)}
		</Card>
	);
}
