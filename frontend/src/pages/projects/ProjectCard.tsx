import type { ReactNode } from 'react';

import { default as FolderX } from 'lucide-react/dist/esm/icons/folder-x';
import { Link } from 'react-router';

import type { PortStatusEntry, ProjectGitStatusSummary, ProjectSummary } from '../../api/types.ts';

import { FilePath } from '../../components/shared/FilePath.tsx';
import { MaturityRing } from '../../components/shared/MaturityRing.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { formatRelativeAge, percent } from '../../lib/formatters.ts';
import { toneText } from '../../lib/tones.ts';
import { touchTargetTextClass } from '../../lib/touchTarget.ts';
import { GitStatusBadge } from './GitStatusBadge.tsx';
import { ProjectActiveRunLink } from './ProjectActiveRunLink.tsx';
import { ProjectCardMetrics } from './ProjectCardMetrics.tsx';
import { artifactTone } from './projects-list-shared.ts';
import { featureProgressColor, isOrphaned, milestoneBadgeTone } from './projects-list-visuals.ts';
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
	const orphan = isOrphaned(project);
	const summary = metadata.artifactCheck?.summary ?? null;
	const milestoneOrder = metadata.roadmap?.milestoneOrder ?? [];
	const milestones = metadata.roadmap?.milestones ?? {};
	const visibleMilestones = milestoneOrder.slice(0, 3);
	const hiddenMilestones = milestoneOrder.length - visibleMilestones.length;
	return (
		<Card className="flex h-full flex-col" interactive>
			{/* The house header, not a hand-rolled copy of it. This card carried a raw `h2` at
			    exactly `headerLevels.section`, its own `mb-3` where CardHeader owns `mb-4`, and a
			    `break-all` path — which broke `D:/applications/aidd-beta-harness` mid-token across
			    two lines at 1280 while every other card identifier in the app truncates on one. The
			    slot set was already CardHeader's: a title, a mono identifier, a one-line
			    description, and an action rail. */}
			<CardHeader
				action={
					<div className="flex flex-col items-end gap-2">
						{totalStages > 0 ? (
							// The table ring labels itself with its percentage. The card ring took
							// the `percent` prop but not `showCenterLabel`, so it still never drew
							// the number — the same datum read two ways in two placements, and the
							// larger of the two rings was the one that said less.
							<MaturityRing
								ariaLabel={`Maturity ${maturity.percent}%`}
								percent={maturity.percent}
								showCenterLabel
								size={56}
								stages={maturity.stageStatuses}
							/>
						) : null}
						{/* The fresh/stale/missing breakdown moved onto the badge's title: as a
						    third row of `text-[10px]` it was off the type scale and squeezed the
						    title block hard enough to wrap the path and the stage line. */}
						<Badge
							title={
								summary
									? `${summary.fresh} fresh · ${summary.stale} stale · ${summary.missing} missing`
									: undefined
							}
							tone={artifactTone[project.artifactHealth]}>
							{project.artifactHealth}
						</Badge>
					</div>
				}
				description={
					totalStages > 0 ? (
						<>
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
						</>
					) : undefined
				}
				identifier={<FilePath path={project.path} />}
				title={
					// The orphan marker rides in the title, not the `icon` slot: that slot is
					// wrapped in `aria-hidden`, which would swallow the `Missing on disk` label
					// that is the only statement of the condition.
					<span className="flex min-w-0 items-center gap-1.5">
						{orphan ? (
							<FolderX
								aria-label="Missing on disk"
								className={`h-4 w-4 shrink-0 ${toneText.amber}`}
							/>
						) : null}
						{detailHref ? (
							<Link
								// 20.4px wide for a short project name, under the 24px AA minimum.
								// The link is last in its heading row, so the width it gains
								// extends the hit area into space the card already had.
								className={`-my-1 truncate rounded py-1 hover:underline focus-visible:underline focus-visible:outline-none max-sm:min-w-11 ${touchTargetTextClass}`}
								to={detailHref}>
								{project.name}
							</Link>
						) : (
							<span className="truncate">{project.name}</span>
						)}
					</span>
				}
			/>
			{/* One identity row. The card used to open with 8-11 pills of identical weight across
			    three rows, with tone carrying four unrelated meanings at once — version, template
			    version, profile bucket and profile source are attributes, not statuses, so they
			    moved into the metric list below and only what describes the project's current
			    state stays a badge. */}
			<div className="mb-3 flex flex-wrap gap-1.5">
				<ProjectStackDisplay stack={metadata.stack} variant="primary" />
				<Badge tone="neutral">{project.phase}</Badge>
				<ProjectActiveRunLink activeRuns={project.activeRuns} />
				<GitStatusBadge className="max-w-full" status={gitStatus} />
			</div>
			{/* Three chips and a count, the same cap the Dashboard's Project Health rows already
			    use. The run was uncapped, so a project with seven milestones ran to three lines
			    while its neighbour with none had zero — the tallest card in a row set the height for
			    every card beside it, and the thing driving it was the least important block on the
			    card. */}
			{visibleMilestones.length > 0 ? (
				<div className="mb-3 flex flex-wrap gap-1">
					{visibleMilestones.map((name) => {
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
					{hiddenMilestones > 0 ? (
						<Badge tone="neutral">+{hiddenMilestones}</Badge>
					) : null}
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
				<ProjectCardMetrics
					portStatus={portStatus}
					project={project}
					spernakitTemplateVersion={spernakitTemplateVersion}
				/>
				{metadata.sync.lastSyncAt ? (
					<div className="text-xs text-muted-foreground">
						Last aidd run {formatRelativeAge(metadata.sync.lastSyncAt)}
					</div>
				) : null}
				{metadata.sync.lastSyncError ? (
					<div className={`text-xs ${toneText.red}`}>{metadata.sync.lastSyncError}</div>
				) : null}
			</div>
			{/* Left-aligned so the footer continues the card's single left edge. Right-aligned, it
			    pulled the eye across the empty band a stretched grid row opens under a short
			    card — to the emptiest, least actionable corner of the surface. */}
			{action ? (
				<div className="mt-auto flex border-t border-border pt-3">{action}</div>
			) : null}
		</Card>
	);
}
