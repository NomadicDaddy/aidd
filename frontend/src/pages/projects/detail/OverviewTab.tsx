import type { ReactNode } from 'react';

import { Link } from 'react-router-dom';

import type {
	ProjectDetail,
	ProjectInterviewProgress,
	ProjectMetadata,
	ProjectRoadmapSummary,
} from '../../../api/types.ts';

import { ExecutionIdentityBadges } from '../../../components/shared/ExecutionIdentityBadges.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { formatCount, formatRatio, formatRelativeAge, percent } from '../../../lib/formatters.ts';
import {
	bucketLabels,
	formatAppVersion,
	formatTemplateVersion,
	profileBucketTone,
} from '../projects-list-shared.ts';
import { ProjectStackDisplay } from '../ProjectStackDisplay.tsx';
import { summarizeMetadataCoverage } from './metadataCoverage.ts';
import { MetadataRow } from './MetadataRow.tsx';
import { projectDetailTabSearch } from './overviewLinks.ts';
import { artifactTone } from './shared.ts';

function LinkedValue({ children, to }: { children: ReactNode; to: string }) {
	return (
		<Link
			className="rounded-sm text-teal-700 underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:outline-none dark:text-teal-300"
			to={to}>
			{children}
		</Link>
	);
}

export function OverviewSummary({ project }: { project: ProjectDetail }) {
	const total = project.featureStats.total;
	const passing = project.featureStats.passing;
	const pct = percent(passing, total);
	const currentMilestone = project.metadata.roadmap?.currentMilestone;
	return (
		<div className="grid gap-4 md:grid-cols-3">
			<Card>
				<div className="text-xs text-neutral-500 uppercase">Feature Progress</div>
				<div className="text-foreground mt-2 text-2xl font-semibold">{pct}%</div>
				<div className="mt-1 text-xs text-neutral-500">
					{passing}/{total} passing · {project.featureStats.failing} failing ·{' '}
					{project.featureStats.waitingApproval} waiting
				</div>
				<div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-900">
					{total > 0 ? (
						<div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
					) : null}
				</div>
			</Card>
			<Card>
				<div className="text-xs text-neutral-500 uppercase">Lifecycle</div>
				<div className="mt-2 text-lg font-semibold text-neutral-950 capitalize dark:text-neutral-50">
					{project.phase}
				</div>
				<div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
					<span>Current milestone</span>
					{currentMilestone ? (
						<Badge tone="teal">{currentMilestone}</Badge>
					) : (
						<span>No active milestone</span>
					)}
				</div>
			</Card>
			<Card className="group transition-colors hover:border-neutral-300 dark:hover:border-neutral-700">
				<Link
					aria-label={`Artifact health: ${project.artifactHealth}. View artifact details.`}
					className="block rounded-lg focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:outline-none"
					to={projectDetailTabSearch('artifacts')}>
					<div className="text-xs text-neutral-500 uppercase">Artifact Health</div>
					<div className="mt-2">
						<Badge tone={artifactTone[project.artifactHealth]}>
							{project.artifactHealth}
						</Badge>
					</div>
					{project.metadata.artifactCheck ? (
						<div className="mt-2 text-xs text-neutral-500">
							{project.metadata.artifactCheck.summary.fresh} fresh ·{' '}
							{project.metadata.artifactCheck.summary.stale} stale ·{' '}
							{project.metadata.artifactCheck.summary.missing} missing
						</div>
					) : (
						<div className="mt-2 text-xs text-neutral-500">
							No artifact check available.
						</div>
					)}
					<div className="mt-2 text-xs text-teal-700 group-hover:underline dark:text-teal-300">
						View artifacts →
					</div>
				</Link>
			</Card>
		</div>
	);
}

export function RoadmapMilestones({ roadmap }: { roadmap: null | ProjectRoadmapSummary }) {
	if (!roadmap) {
		return <LinkedValue to={projectDetailTabSearch('artifacts')}>No roadmap.json</LinkedValue>;
	}
	const names = Object.keys(roadmap.milestones);
	if (names.length === 0) {
		return <span className="text-neutral-500">No milestones defined</span>;
	}
	return (
		<div className="space-y-1">
			{names.map((name) => {
				const item = roadmap.milestones[name];
				if (!item) return null;
				const isCurrent = roadmap.currentMilestone === name;
				return (
					<Link
						className="group flex items-center justify-between gap-2 rounded-sm focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:outline-none"
						key={name}
						to={projectDetailTabSearch('features', { featureMilestone: name })}>
						<div
							className={
								isCurrent
									? 'flex items-center text-sm font-medium text-neutral-900 group-hover:text-teal-700 dark:text-neutral-100 dark:group-hover:text-teal-300'
									: 'flex items-center text-sm text-neutral-600 group-hover:text-teal-700 dark:text-neutral-400 dark:group-hover:text-teal-300'
							}>
							<span>{name}</span>
							{isCurrent ? (
								<Badge className="ml-1.5" tone="teal">
									current
								</Badge>
							) : null}
						</div>
						<span className="font-mono text-xs text-neutral-500">
							{formatRatio(item.completed, item.total)}
						</span>
					</Link>
				);
			})}
		</div>
	);
}

export function InterviewSummary({ interview }: { interview: null | ProjectInterviewProgress }) {
	if (!interview) return <span className="text-neutral-500">No interview file</span>;
	if (interview.total === 0) return <span className="text-neutral-500">0 questions</span>;
	return <span>{formatRatio(interview.answered, interview.total)}</span>;
}

export function OverviewMetadata({ metadata }: { metadata: ProjectMetadata }) {
	const ports = metadata.ports;
	const coverage = summarizeMetadataCoverage(metadata);
	return (
		<div className="grid gap-4 md:grid-cols-2">
			<Card>
				<div className="mb-2 flex flex-wrap items-center justify-between gap-2">
					<h2 className="text-foreground text-sm font-semibold">Project metadata</h2>
					<Link
						className="flex min-w-0 flex-wrap items-center gap-1.5"
						title={coverage.title}
						to={projectDetailTabSearch('artifacts')}>
						<span className="text-xs text-neutral-500">{coverage.detail}</span>
						<Badge tone={coverage.tone}>{coverage.label}</Badge>
					</Link>
				</div>
				<div className="divide-y divide-neutral-100 dark:divide-neutral-900">
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
								{metadata.specUpdatedAt
									? formatRelativeAge(metadata.specUpdatedAt)
									: '—'}
							</LinkedValue>
						}
					/>
					<MetadataRow
						label="Date added"
						value={metadata.addedAt ? formatRelativeAge(metadata.addedAt) : '—'}
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
								<Badge tone={profileBucketTone(metadata.profile.bucket)}>
									{bucketLabels[metadata.profile.bucket]}
								</Badge>
							</LinkedValue>
						}
					/>
				</div>
			</Card>
			<Card>
				<div className="mb-2 flex items-center justify-between gap-2">
					<h2 className="text-foreground text-sm font-semibold">Roadmap</h2>
					<Link
						className="text-xs text-teal-700 underline-offset-2 hover:underline dark:text-teal-300"
						to={projectDetailTabSearch('features')}>
						View features
					</Link>
				</div>
				<RoadmapMilestones roadmap={metadata.roadmap} />
				<h2 className="text-foreground mt-4 mb-2 text-sm font-semibold">aidd activity</h2>
				<div className="divide-y divide-neutral-100 dark:divide-neutral-900">
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
								{metadata.sync.lastSyncAt
									? formatRelativeAge(metadata.sync.lastSyncAt)
									: 'Never'}
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
					<p className="mt-2 text-xs text-red-700 dark:text-red-400">
						{metadata.sync.lastSyncError}
					</p>
				) : null}
			</Card>
		</div>
	);
}
