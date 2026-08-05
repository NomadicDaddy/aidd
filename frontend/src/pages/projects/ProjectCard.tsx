import type { ReactNode } from 'react';

import { default as FolderX } from 'lucide-react/dist/esm/icons/folder-x';
import { Link } from 'react-router';

import type { PortStatusEntry, ProjectGitStatusSummary, ProjectSummary } from '../../api/types.ts';

import { MaturityRing } from '../../components/shared/MaturityRing.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Card } from '../../components/ui/card.tsx';
import { formatCount, formatRatio, formatRelativeAge, percent } from '../../lib/formatters.ts';
import { toneSolid, toneText } from '../../lib/tones.ts';
import { GitStatusBadge } from './GitStatusBadge.tsx';
import { ProjectActiveRunLink } from './ProjectActiveRunLink.tsx';
import {
	artifactTone,
	bucketLabels,
	formatAppVersion,
	formatProjectListReportedCost,
	formatProjectTokenCount,
	profileBucketTone,
	syncTone,
} from './projects-list-shared.ts';
import {
	daysSince,
	featureProgressColor,
	isOrphaned,
	milestoneBadgeTone,
	specAgeColor,
	templateVersionColor,
} from './projects-list-visuals.ts';
import { ProjectStackDisplay } from './ProjectStackDisplay.tsx';

export function ProjectCard({
	action,
	detailHref,
	gitStatus,
	portStatus,
	project,
	spernakitTemplateVersion = null,
}: {
	/** Optional action rendered in a reserved footer slot (e.g. app launch control). */
	action?: ReactNode;
	/** When set, the project name renders as a react-router link to the project detail. */
	detailHref?: string;
	gitStatus: ProjectGitStatusSummary | undefined;
	portStatus: PortStatusEntry | undefined;
	project: ProjectSummary;
	/** Version of the spernakit template checkout; colors the `spk` marker when known. */
	spernakitTemplateVersion?: null | string;
}) {
	const { metadata } = project;
	const totalFeatures = project.featureStats.total;
	const passing = project.featureStats.passing;
	const failing = project.featureStats.failing;
	const maturity = metadata.maturity;
	const stageIndex = maturity.currentStageId
		? maturity.stageStatuses.findIndex((stage) => stage.id === maturity.currentStageId) + 1
		: maturity.stageStatuses.length;
	const totalStages = maturity.stageStatuses.length;
	const pct = percent(passing, totalFeatures);
	const specDays = daysSince(metadata.specUpdatedAt);
	const orphan = isOrphaned(project);
	const summary = metadata.artifactCheck?.summary ?? null;
	const milestoneOrder = metadata.roadmap?.milestoneOrder ?? [];
	const milestones = metadata.roadmap?.milestones ?? {};
	const ports = metadata.ports;
	const fePort = ports?.frontendPort ?? null;
	const bePort = ports?.backendPort ?? null;
	const feListening = portStatus?.frontend ?? null;
	const beListening = portStatus?.backend ?? null;
	return (
		<Card className="flex h-full flex-col" interactive>
			<div className="mb-3 flex items-start justify-between gap-3">
				<div className="min-w-0">
					<h2 className="flex items-center gap-1.5 truncate text-base font-semibold text-foreground">
						{orphan ? (
							<FolderX
								aria-label="Missing on disk"
								className={`h-4 w-4 shrink-0 ${toneText.amber}`}
							/>
						) : null}
						{detailHref ? (
							<Link
								className="-my-1 truncate rounded py-1 hover:underline focus-visible:underline focus-visible:outline-none"
								to={detailHref}>
								{project.name}
							</Link>
						) : (
							<span className="truncate">{project.name}</span>
						)}
					</h2>
					<p className="text-xs break-all text-muted-foreground">{project.path}</p>
					{totalStages > 0 ? (
						<p className="mt-1 text-xs text-muted-foreground">
							Stage {Math.max(stageIndex, 1)}/{totalStages}:{' '}
							{maturity.currentStageLabel ?? 'Complete'}
							{maturity.nextArtifactLabel ? (
								<>
									{' · Next: '}
									<span className="font-medium">
										{maturity.nextArtifactLabel}
									</span>
								</>
							) : null}
						</p>
					) : null}
				</div>
				<div className="flex flex-col items-end gap-2">
					{totalStages > 0 ? (
						<MaturityRing
							ariaLabel={`Maturity ${maturity.percent}%`}
							size={56}
							stages={maturity.stageStatuses}
						/>
					) : null}
					<Badge tone={artifactTone[project.artifactHealth]}>
						{project.artifactHealth}
					</Badge>
					{summary ? (
						<div className="text-[10px] text-muted-foreground">
							{summary.fresh} fresh · {summary.stale} stale · {summary.missing}{' '}
							missing
						</div>
					) : null}
				</div>
			</div>
			<div className="mb-3 flex flex-wrap gap-1.5">
				<Badge tone="neutral">{formatAppVersion(metadata.appVersion)}</Badge>
				{metadata.templateVersion ? (
					<Badge tone="neutral">
						<span
							className={templateVersionColor(
								metadata.templateVersion,
								spernakitTemplateVersion,
							)}>
							spk {metadata.templateVersion}
						</span>
					</Badge>
				) : null}
				<ProjectStackDisplay stack={metadata.stack} variant="badges" />
				<Badge tone={profileBucketTone(metadata.profile.bucket)}>
					{bucketLabels[metadata.profile.bucket]}
				</Badge>
				<Badge tone={metadata.profile.source === 'explicit' ? 'teal' : 'neutral'}>
					{metadata.profile.source}
				</Badge>
				<Badge tone="neutral">{project.phase}</Badge>
				<ProjectActiveRunLink activeRuns={project.activeRuns} />
				<GitStatusBadge className="max-w-full" status={gitStatus} />
			</div>
			{milestoneOrder.length > 0 ? (
				<div className="mb-3 flex flex-wrap gap-1">
					{milestoneOrder.map((name) => {
						const ms = milestones[name];
						if (!ms) return null;
						return (
							<Badge key={name} tone={milestoneBadgeTone(ms)}>
								<span className="font-medium">{name}</span>
								<span className="ml-1 tabular-nums">
									{ms.completed}/{ms.total}
								</span>
							</Badge>
						);
					})}
				</div>
			) : null}
			<div className="space-y-2 text-sm text-foreground">
				<div>
					{passing}/{totalFeatures} features passing
					{failing > 0 ? (
						<span className={`ml-2 text-xs ${toneText.amber}`}>
							({failing} failing)
						</span>
					) : null}
				</div>
				<div className="h-2 overflow-hidden rounded-full bg-muted">
					{totalFeatures > 0 ? (
						<div
							className={`h-full ${featureProgressColor(pct)}`}
							style={{ width: `${pct}%` }}
						/>
					) : null}
				</div>
				<div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
					<div>
						Interview:{' '}
						{metadata.interview
							? formatRatio(metadata.interview.answered, metadata.interview.total)
							: '—'}
					</div>
					<div>Scenarios: {formatCount(metadata.testScenariosCount)}</div>
					<div>Screens: {formatCount(metadata.screenMapRouteCount)}</div>
					<div
						title={`${metadata.usage.totals.runsWithReportedCost}/${metadata.usage.totals.runCount} finalized runs reported cost`}>
						Reported cost:{' '}
						<span className="font-medium text-foreground tabular-nums">
							{formatProjectListReportedCost(metadata.usage.totals)}
						</span>
					</div>
					<div
						title={`${metadata.usage.totals.runsWithTokenUsage}/${metadata.usage.totals.runCount} finalized runs reported token usage`}>
						Tokens:{' '}
						<span className="font-medium text-foreground tabular-nums">
							{formatProjectTokenCount(metadata.usage.totals)}
						</span>
					</div>
					<div>
						Spec age:{' '}
						{specDays !== null ? (
							<span className={specAgeColor(specDays)}>{specDays}d</span>
						) : (
							<span className="text-muted-foreground">—</span>
						)}
					</div>
					<div>
						Added:{' '}
						{metadata.addedAt ? (
							<span title={metadata.addedAt}>
								{formatRelativeAge(metadata.addedAt)}
							</span>
						) : (
							<span className="text-muted-foreground">—</span>
						)}
					</div>
					<div>
						aidd state:{' '}
						<Badge tone={syncTone(metadata.sync.syncState)}>
							{metadata.sync.syncState}
						</Badge>
					</div>
					{fePort !== null || bePort !== null ? (
						<div className="font-mono">
							{fePort !== null ? (
								<span className="inline-flex items-center gap-1">
									<PortDotInline listening={feListening} />
									FE:{fePort}
								</span>
							) : null}
							{fePort !== null && bePort !== null ? (
								<span className="mx-1 text-muted-foreground">·</span>
							) : null}
							{bePort !== null ? (
								<span className="inline-flex items-center gap-1">
									<PortDotInline listening={beListening} />
									BE:{bePort}
								</span>
							) : null}
						</div>
					) : null}
				</div>
				{metadata.sync.lastSyncAt ? (
					<div className="text-xs text-muted-foreground">
						Last aidd run {formatRelativeAge(metadata.sync.lastSyncAt)}
					</div>
				) : null}
				{metadata.sync.lastSyncError ? (
					<div className={`text-xs ${toneText.red}`}>{metadata.sync.lastSyncError}</div>
				) : null}
			</div>
			{action ? (
				<div className="mt-auto flex justify-end border-t border-border pt-3">{action}</div>
			) : null}
		</Card>
	);
}

function PortDotInline({ listening }: { listening: boolean | null }) {
	if (listening === null) return null;
	return (
		<span
			aria-label={listening ? 'Listening' : 'Not listening'}
			className={`inline-block h-1.5 w-1.5 rounded-full ${
				toneSolid[listening ? 'emerald' : 'red']
			}`}
			title={listening ? 'Listening' : 'Not listening'}
		/>
	);
}
