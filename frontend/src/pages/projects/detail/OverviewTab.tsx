import type { ReactNode } from 'react';

import { Link } from 'react-router';

import type {
	ProjectInterviewProgress,
	ProjectMetadata,
	ProjectRoadmapSummary,
} from '../../../api/types.ts';

import { ExecutionIdentityBadges } from '../../../components/shared/ExecutionIdentityBadges.tsx';
import { RelativeAge } from '../../../components/shared/RelativeAge.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { formatCount, formatRatio } from '../../../lib/formatters.ts';
import { toneText } from '../../../lib/tones.ts';
import { bucketLabels, formatAppVersion, formatTemplateVersion } from '../projects-list-shared.ts';
import { ProjectStackDisplay } from '../ProjectStackDisplay.tsx';
import { summarizeMetadataCoverage } from './metadataCoverage.ts';
import { MetadataRow } from './MetadataRow.tsx';
import { projectDetailTabSearch } from './overviewLinks.ts';

function LinkedValue({ children, to }: { children: ReactNode; to: string }) {
	return (
		<Link
			className="rounded-sm text-accent underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
			to={to}>
			{children}
		</Link>
	);
}

export function RoadmapMilestones({ roadmap }: { roadmap: null | ProjectRoadmapSummary }) {
	if (!roadmap) {
		return <LinkedValue to={projectDetailTabSearch('artifacts')}>No roadmap.json</LinkedValue>;
	}
	const names = Object.keys(roadmap.milestones);
	if (names.length === 0) {
		return <span className="text-muted-foreground">No milestones defined</span>;
	}
	return (
		<div className="space-y-1">
			{names.map((name) => {
				const item = roadmap.milestones[name];
				if (!item) return null;
				const isCurrent = roadmap.currentMilestone === name;
				return (
					<Link
						className="group flex items-center justify-between gap-2 rounded-sm focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
						key={name}
						to={projectDetailTabSearch('features', { featureMilestone: name })}>
						<div
							className={
								isCurrent
									? 'flex items-center text-sm font-medium text-foreground group-hover:text-accent'
									: 'flex items-center text-sm text-muted-foreground group-hover:text-accent'
							}>
							<span>{name}</span>
							{isCurrent ? (
								<Badge className="ml-1.5" tone="neutral">
									current
								</Badge>
							) : null}
						</div>
						<span className="font-mono text-xs text-muted-foreground">
							{formatRatio(item.completed, item.total)}
						</span>
					</Link>
				);
			})}
		</div>
	);
}

export function InterviewSummary({ interview }: { interview: null | ProjectInterviewProgress }) {
	if (!interview) return <span className="text-muted-foreground">No interview file</span>;
	if (interview.total === 0) return <span className="text-muted-foreground">0 questions</span>;
	return <span>{formatRatio(interview.answered, interview.total)}</span>;
}

export function OverviewMetadata({ metadata }: { metadata: ProjectMetadata }) {
	const ports = metadata.ports;
	const coverage = summarizeMetadataCoverage(metadata);
	return (
		<div className="grid gap-4 lg:grid-cols-2">
			<Card>
				<CardHeader
					action={
						<Link
							className="flex min-w-0 flex-wrap items-center gap-1.5"
							title={coverage.title}
							to={projectDetailTabSearch('artifacts')}>
							<span className="text-xs text-muted-foreground">{coverage.detail}</span>
							<Badge tone={coverage.tone}>{coverage.label}</Badge>
						</Link>
					}
					className="mb-2"
					title="Project metadata"
				/>
				<div className="divide-y divide-border">
					<MetadataRow
						label="App version"
						value={formatAppVersion(metadata.appVersion)}
					/>
					<MetadataRow label="Template version" value={formatTemplateVersion(metadata)} />
					<MetadataRow
						label="Stack"
						value={<ProjectStackDisplay stack={metadata.stack} variant="detail" />}
					/>
					<MetadataRow label="Frontend port" value={ports?.frontendPort ?? '—'} />
					<MetadataRow label="Backend port" value={ports?.backendPort ?? '—'} />
					<MetadataRow
						label="Spec updated"
						value={
							<LinkedValue to={projectDetailTabSearch('artifacts')}>
								<RelativeAge value={metadata.specUpdatedAt} />
							</LinkedValue>
						}
					/>
					<MetadataRow
						label="Date added"
						value={<RelativeAge value={metadata.addedAt} />}
					/>
					<MetadataRow
						label="Screens"
						value={
							<LinkedValue to={projectDetailTabSearch('artifacts')}>
								{formatCount(metadata.screenMapRouteCount)}
							</LinkedValue>
						}
					/>
					<MetadataRow
						label="Test scenarios"
						value={
							<LinkedValue to={projectDetailTabSearch('artifacts')}>
								{formatCount(metadata.testScenariosCount)}
							</LinkedValue>
						}
					/>
					<MetadataRow
						label="Interview"
						value={
							<LinkedValue to={projectDetailTabSearch('interview')}>
								<InterviewSummary interview={metadata.interview} />
							</LinkedValue>
						}
					/>
					<MetadataRow
						label="Profile"
						value={
							<LinkedValue to={projectDetailTabSearch('profile')}>
								<Badge tone="neutral">
									{bucketLabels[metadata.profile.bucket]}
								</Badge>
							</LinkedValue>
						}
					/>
				</div>
			</Card>
			<Card>
				<CardHeader
					action={
						<Link
							className="text-xs text-accent underline-offset-2 hover:underline"
							to={projectDetailTabSearch('features')}>
							View features
						</Link>
					}
					className="mb-2"
					title="Roadmap"
				/>
				<RoadmapMilestones roadmap={metadata.roadmap} />
				<CardHeader className="mt-4 mb-2" title="aidd activity" />
				<div className="divide-y divide-border">
					<MetadataRow
						label="aidd state"
						value={
							<LinkedValue to={projectDetailTabSearch('runs')}>
								<Badge>{metadata.sync.syncState}</Badge>
							</LinkedValue>
						}
					/>
					<MetadataRow
						label="Last run"
						value={
							<LinkedValue to={projectDetailTabSearch('runs')}>
								{metadata.sync.lastSyncAt ? (
									<RelativeAge value={metadata.sync.lastSyncAt} />
								) : (
									'Never'
								)}
							</LinkedValue>
						}
					/>
					<MetadataRow
						label="Last-used target"
						value={
							<div className="flex flex-wrap items-center gap-2">
								<ExecutionIdentityBadges
									backend={metadata.sync.preferredCli}
									model={metadata.sync.preferredModel}
									provider={metadata.sync.preferredProvider}
									reasoningEffort={metadata.sync.preferredReasoningEffort}
								/>
								<LinkedValue to={projectDetailTabSearch('runs')}>Runs</LinkedValue>
							</div>
						}
					/>
				</div>
				{metadata.sync.lastSyncError ? (
					<p className={`mt-2 text-xs ${toneText.red}`}>{metadata.sync.lastSyncError}</p>
				) : null}
			</Card>
		</div>
	);
}
