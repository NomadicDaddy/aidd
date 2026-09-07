import type { ReactNode } from 'react';

import { Link } from 'react-router';

import type {
	ProjectInterviewProgress,
	ProjectMetadata,
	ProjectRoadmapSummary,
} from '../../../api/types.ts';

import { RelativeAge } from '../../../components/shared/RelativeAge.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Card, CardHeader, cardHeaderLinkClass } from '../../../components/ui/card.tsx';
import { formatCount, formatRatio, formatRelativeAge } from '../../../lib/formatters.ts';
import { touchTargetRowClass, touchTargetTextClass } from '../../../lib/touchTarget.ts';
import { bucketLabels, formatAppVersion, formatTemplateVersion } from '../projects-list-shared.ts';
import { ProjectStackDisplay } from '../ProjectStackDisplay.tsx';
import { summarizeMetadataCoverage } from './metadataCoverage.ts';
import { MetadataRow } from './MetadataRow.tsx';
import { projectDetailTabSearch } from './overviewLinks.ts';

function LinkedValue({
	ariaLabel,
	children,
	to,
}: {
	ariaLabel: string;
	children: ReactNode;
	to: string;
}) {
	return (
		<Link
			aria-label={ariaLabel}
			// `max-sm:min-w-11` because the values here are things like `83`, `47` and `0/40`:
			// measured 15.5px wide, the narrowest target left in the app and under the 24px
			// AA minimum as well as the 44px one. It is the whole content of its `dd`, so the
			// width it gains is empty space to the right of a number rather than a wedge
			// driven into a line of text.
			className={`rounded-sm text-accent underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none max-sm:min-w-11 ${touchTargetTextClass}`}
			to={to}>
			{children}
		</Link>
	);
}

export function RoadmapMilestones({ roadmap }: { roadmap: null | ProjectRoadmapSummary }) {
	if (!roadmap) {
		return (
			<LinkedValue
				ariaLabel="Roadmap: not found. View artifact details."
				to={projectDetailTabSearch('artifacts')}>
				No roadmap.json
			</LinkedValue>
		);
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
						aria-label={`Milestone ${name}: ${formatRatio(item.completed, item.total)} complete. View matching features.`}
						className={`group flex items-center justify-between gap-2 rounded-sm focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${touchTargetRowClass}`}
						key={name}
						to={projectDetailTabSearch('features', { featureMilestone: name })}>
						<div
							className={`flex items-center text-sm text-accent ${isCurrent ? 'font-medium' : ''}`}>
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

export function OverviewMetadata({
	metadata,
	recentActivity,
}: {
	metadata: ProjectMetadata;
	recentActivity: ReactNode;
}) {
	const ports = metadata.ports;
	const coverage = summarizeMetadataCoverage(metadata);
	const screens = formatCount(metadata.screenMapRouteCount);
	const scenarios = formatCount(metadata.testScenariosCount);
	const interview = metadata.interview;
	const interviewValue = interview
		? interview.total === 0
			? '0 questions'
			: formatRatio(interview.answered, interview.total)
		: 'no interview file';
	const profile = bucketLabels[metadata.profile.bucket];
	return (
		<div className="grid items-start gap-4 lg:grid-cols-2">
			<Card>
				<CardHeader
					className="mb-3"
					headingLevel={3}
					status={
						<Link
							className={cardHeaderLinkClass}
							title={coverage.title}
							to={projectDetailTabSearch('artifacts')}>
							<span className="text-xs text-muted-foreground">{coverage.detail}</span>
							<Badge tone={coverage.tone}>{coverage.label}</Badge>
						</Link>
					}
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
						link={{
							ariaLabel: `Spec updated: ${formatRelativeAge(metadata.specUpdatedAt)}. View artifact details.`,
							to: projectDetailTabSearch('artifacts'),
						}}
						value={<RelativeAge value={metadata.specUpdatedAt} />}
					/>
					<MetadataRow
						label="Date added"
						value={<RelativeAge value={metadata.addedAt} />}
					/>
					<MetadataRow
						label="Screens"
						link={{
							ariaLabel: `Screens: ${screens === '—' ? 'none mapped' : screens}. View artifact details.`,
							to: projectDetailTabSearch('artifacts'),
						}}
						value={screens}
					/>
					<MetadataRow
						label="Test scenarios"
						link={{
							ariaLabel: `Test scenarios: ${scenarios === '—' ? 'none mapped' : scenarios}. View artifact details.`,
							to: projectDetailTabSearch('artifacts'),
						}}
						value={scenarios}
					/>
					<MetadataRow
						label="Interview"
						link={{
							ariaLabel: `Interview: ${interviewValue}. View interview details.`,
							to: projectDetailTabSearch('interview'),
						}}
						value={<InterviewSummary interview={interview} />}
					/>
					<MetadataRow
						label="Profile"
						link={{
							ariaLabel: `Profile: ${profile}. View assurance profile.`,
							to: projectDetailTabSearch('profile'),
						}}
						value={<Badge tone="neutral">{profile}</Badge>}
					/>
				</div>
			</Card>
			<div className="space-y-4">
				<Card>
					<CardHeader
						action={
							<Link
								className={cardHeaderLinkClass}
								to={projectDetailTabSearch('features')}>
								View features
							</Link>
						}
						className="mb-3"
						headingLevel={3}
						title="Roadmap"
					/>
					<RoadmapMilestones roadmap={metadata.roadmap} />
				</Card>
				{recentActivity}
			</div>
		</div>
	);
}
