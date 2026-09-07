import { default as FolderX } from 'lucide-react/dist/esm/icons/folder-x';
import { Link } from 'react-router';

import type { PortStatusEntry, ProjectGitStatusSummary, ProjectSummary } from '../../api/types.ts';

import { FilePath } from '../../components/shared/FilePath.tsx';
import { MaturityRing } from '../../components/shared/MaturityRing.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { cn } from '../../lib/cn.ts';
import { formatRelativeAge } from '../../lib/formatters.ts';
import { pinnedLeftEdgeClass } from '../../lib/tableStyles.ts';
import { toneText } from '../../lib/tones.ts';
import { touchTargetTextClass } from '../../lib/touchTarget.ts';
import { GitStatusBadge } from './GitStatusBadge.tsx';
import { ProjectActiveRunLink } from './ProjectActiveRunLink.tsx';
import {
	bucketLabels,
	formatAppVersion,
	formatProjectListReportedCost,
	formatProjectTokenCount,
	syncTone,
} from './projects-list-shared.ts';
import {
	daysSince,
	isOrphaned,
	specAgeColor,
	templateVersionColor,
} from './projects-list-visuals.ts';
import { projectTableCellClass, projectTableNameCellClass } from './projects-table-columns.ts';
import {
	ArtifactCell,
	FeatureProgressCell,
	PortsCell,
	TokenSparkline,
} from './ProjectsTableCells.tsx';
import { ProjectStackDisplay } from './ProjectStackDisplay.tsx';

export function ProjectTableRow({
	collisions,
	gitStatus,
	optionalColumns,
	portStatus,
	project,
	spernakitTemplateVersion = null,
}: {
	collisions: {
		backend: Map<number, string[]>;
		frontend: Map<number, string[]>;
	};
	gitStatus: ProjectGitStatusSummary | undefined;
	/**
	 * Opt-in columns currently enabled. The cells below stay in `projects-table-columns.ts` order
	 * so the row and the header line up; `projects-table-columns.test.ts` holds them to it.
	 */
	optionalColumns: ReadonlySet<string>;
	portStatus: PortStatusEntry | undefined;
	project: ProjectSummary;
	/** Version of the spernakit template checkout; colors the `spk` marker when known. */
	spernakitTemplateVersion?: null | string;
}) {
	const { metadata } = project;
	const fePeers =
		typeof metadata.ports?.frontendPort === 'number'
			? (collisions.frontend.get(metadata.ports.frontendPort) ?? [])
			: [];
	const bePeers =
		typeof metadata.ports?.backendPort === 'number'
			? (collisions.backend.get(metadata.ports.backendPort) ?? [])
			: [];
	const frontendCollision = fePeers.length > 1;
	const backendCollision = bePeers.length > 1;
	const collisionPeers = Array.from(
		new Set([...fePeers, ...bePeers].filter((name) => name !== project.name)),
	);
	const specDays = daysSince(metadata.specUpdatedAt);
	const orphan = isOrphaned(project);

	return (
		<tr className="group border-b border-border transition-colors last:border-0 hover:bg-muted/40">
			{/* Pinned: scrolling right to reach the opt-in columns would otherwise carry the name
			    off the left edge, leaving anonymous rows of numbers. `bg-card` is what stops the
			    scrolled content showing through the pinned cell.
			    Which is also why the row's hover tint arrives here as a gradient rather than as a
			    background-color: `hover:bg-muted/40` on this cell would replace `bg-card` with a
			    40%-opaque fill and the columns sliding underneath would show through the project
			    name. A flat two-stop gradient paints the same tint in the background-image layer,
			    above the opaque card colour instead of in place of it. */}
			<td
				className={cn(
					'sticky left-0 z-10 bg-card px-3 py-3 group-hover:bg-gradient-to-r group-hover:from-muted/40 group-hover:to-muted/40',
					projectTableNameCellClass,
					pinnedLeftEdgeClass,
				)}>
				<div className="flex items-center gap-1.5">
					{orphan ? (
						<FolderX
							aria-label="Missing on disk"
							className={`h-4 w-4 shrink-0 ${toneText.amber}`}
						/>
					) : null}
					<Link
						className={`font-medium text-foreground hover:underline ${touchTargetTextClass}`}
						to={`/projects/${encodeURIComponent(project.routeId)}`}>
						{project.name}
					</Link>
				</div>
				<div className="flex min-w-0 items-baseline gap-1.5 text-xs">
					<FilePath
						className="min-w-0 truncate text-muted-foreground"
						path={project.path}
					/>
					{specDays !== null ? (
						<span
							className={`shrink-0 ${specAgeColor(specDays)}`}
							title={`Spec last updated ${specDays} day${specDays === 1 ? '' : 's'} ago`}>
							· spec {specDays}d
						</span>
					) : null}
				</div>
			</td>
			{optionalColumns.has('version') ? (
				<td className={cn(projectTableCellClass, 'font-mono text-xs')}>
					{metadata.appVersion ? (
						formatAppVersion(metadata.appVersion)
					) : (
						<span className="text-muted-foreground">
							{formatAppVersion(metadata.appVersion)}
						</span>
					)}
					{metadata.templateVersion ? (
						<div
							className={`text-2xs ${
								templateVersionColor(
									metadata.templateVersion,
									spernakitTemplateVersion,
								) || 'text-muted-foreground'
							}`}>
							spk {metadata.templateVersion}
						</div>
					) : null}
				</td>
			) : null}
			<td className={projectTableCellClass}>
				<ProjectActiveRunLink activeRuns={project.activeRuns} empty="placeholder" />
			</td>
			{optionalColumns.has('port') ? (
				<td className={projectTableCellClass}>
					<PortsCell
						backendCollision={backendCollision}
						collisionPeers={collisionPeers}
						frontendCollision={frontendCollision}
						ports={metadata.ports}
						status={portStatus}
					/>
				</td>
			) : null}
			{optionalColumns.has('stack') ? (
				<td className={projectTableCellClass}>
					<ProjectStackDisplay stack={metadata.stack} variant="table" />
				</td>
			) : null}
			{optionalColumns.has('profile') ? (
				<td className={projectTableCellClass}>
					<div className="flex flex-wrap gap-1">
						<Badge tone="neutral">{bucketLabels[metadata.profile.bucket]}</Badge>
						{metadata.profile.source === 'inferred' ? (
							<Badge casing="title" tone="neutral">
								inferred
							</Badge>
						) : null}
					</div>
				</td>
			) : null}
			<td className={projectTableCellClass}>
				<FeatureProgressCell
					failing={project.featureStats.failing}
					passing={project.featureStats.passing}
					total={project.featureStats.total}
				/>
			</td>
			{optionalColumns.has('reportedCost') ? (
				<td
					className={projectTableCellClass}
					title={`${metadata.usage.totals.runsWithReportedCost}/${metadata.usage.totals.runCount} finalized runs reported cost`}>
					<div className="font-medium tabular-nums">
						{formatProjectListReportedCost(metadata.usage.totals)}
					</div>
					<div className="text-2xs text-muted-foreground tabular-nums">
						{metadata.usage.totals.runsWithReportedCost}/
						{metadata.usage.totals.runCount} runs
					</div>
				</td>
			) : null}
			{optionalColumns.has('tokens') ? (
				<td
					className={projectTableCellClass}
					title={`${metadata.usage.totals.runsWithTokenUsage}/${metadata.usage.totals.runCount} finalized runs reported token usage`}>
					<div className="font-medium tabular-nums">
						{formatProjectTokenCount(metadata.usage.totals)}
					</div>
					<TokenSparkline points={metadata.usage.recentDailyTokens} />
					<div className="text-2xs text-muted-foreground tabular-nums">
						{metadata.usage.totals.runsWithTokenUsage}/{metadata.usage.totals.runCount}{' '}
						runs
					</div>
				</td>
			) : null}
			<td className={projectTableCellClass}>
				{metadata.maturity.stageStatuses.length > 0 ? (
					<div className="flex items-center gap-2">
						<MaturityRing
							ariaLabel={`Maturity ${metadata.maturity.percent}%`}
							percent={metadata.maturity.percent}
							showCenterLabel
							size={36}
							stages={metadata.maturity.stageStatuses}
						/>
						<span className="text-xs text-muted-foreground">
							{metadata.maturity.currentStageLabel ?? 'Complete'}
						</span>
					</div>
				) : (
					<span className="text-muted-foreground">—</span>
				)}
			</td>
			{optionalColumns.has('artifacts') ? (
				<td className={projectTableCellClass}>
					<ArtifactCell
						health={project.artifactHealth}
						summary={metadata.artifactCheck?.summary ?? null}
					/>
				</td>
			) : null}
			<td className={projectTableCellClass}>
				<GitStatusBadge className="max-w-full" status={gitStatus} />
			</td>
			<td className={projectTableCellClass}>
				<Badge tone={syncTone(metadata.sync.syncState)}>{metadata.sync.syncState}</Badge>
				{metadata.sync.lastSyncAt ? (
					<div className="text-xs text-muted-foreground">
						{formatRelativeAge(metadata.sync.lastSyncAt)}
					</div>
				) : null}
			</td>
			{optionalColumns.has('addedAt') ? (
				<td className={cn(projectTableCellClass, 'text-xs text-muted-foreground')}>
					{metadata.addedAt ? (
						<span title={metadata.addedAt}>{formatRelativeAge(metadata.addedAt)}</span>
					) : (
						<span className="text-muted-foreground">—</span>
					)}
				</td>
			) : null}
		</tr>
	);
}
