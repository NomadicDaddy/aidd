import { default as FolderX } from 'lucide-react/dist/esm/icons/folder-x';
import { Link } from 'react-router';

import type { PortStatusEntry, ProjectGitStatusSummary, ProjectSummary } from '../../api/types.ts';

import { FilePath } from '../../components/shared/FilePath.tsx';
import { MaturityRing } from '../../components/shared/MaturityRing.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { formatRelativeAge } from '../../lib/formatters.ts';
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
		<tr className="border-b border-border last:border-0">
			{/* Pinned: scrolling right to reach the opt-in columns used to carry the name off the
			    left edge, leaving anonymous rows of numbers. `bg-card` is what stops the scrolled
			    content showing through the pinned cell. */}
			<td className="sticky left-0 z-10 bg-card px-3 py-3">
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
				<FilePath
					className="block truncate text-xs text-muted-foreground"
					path={project.path}
				/>
				{specDays !== null ? (
					<div
						className={`text-xs ${specAgeColor(specDays)}`}
						title={`Spec last updated ${specDays} day${specDays === 1 ? '' : 's'} ago`}>
						spec {specDays}d
					</div>
				) : null}
			</td>
			{optionalColumns.has('version') ? (
				<td className="px-3 py-3 font-mono text-xs">
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
			<td className="px-3 py-3 whitespace-nowrap">
				<ProjectActiveRunLink activeRuns={project.activeRuns} />
			</td>
			{optionalColumns.has('port') ? (
				<td className="px-3 py-3">
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
				<td className="px-3 py-3">
					<ProjectStackDisplay stack={metadata.stack} variant="table" />
				</td>
			) : null}
			{optionalColumns.has('profile') ? (
				<td className="px-3 py-3">
					<div className="flex flex-wrap gap-1">
						<Badge tone="neutral">{bucketLabels[metadata.profile.bucket]}</Badge>
						{metadata.profile.source === 'inferred' ? (
							<Badge tone="neutral">inferred</Badge>
						) : null}
					</div>
				</td>
			) : null}
			<td className="px-3 py-3">
				<FeatureProgressCell
					failing={project.featureStats.failing}
					passing={project.featureStats.passing}
					total={project.featureStats.total}
				/>
			</td>
			{optionalColumns.has('reportedCost') ? (
				<td
					className="px-3 py-3 whitespace-nowrap"
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
					className="px-3 py-3 whitespace-nowrap"
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
			<td className="px-3 py-3">
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
				<td className="px-3 py-3">
					<ArtifactCell
						health={project.artifactHealth}
						summary={metadata.artifactCheck?.summary ?? null}
					/>
				</td>
			) : null}
			<td className="px-3 py-3">
				<GitStatusBadge className="max-w-[12rem]" status={gitStatus} />
			</td>
			<td className="px-3 py-3">
				<Badge tone={syncTone(metadata.sync.syncState)}>{metadata.sync.syncState}</Badge>
				{metadata.sync.lastSyncAt ? (
					<div className="text-xs text-muted-foreground">
						{formatRelativeAge(metadata.sync.lastSyncAt)}
					</div>
				) : null}
			</td>
			{optionalColumns.has('addedAt') ? (
				<td className="px-3 py-3 text-xs whitespace-nowrap text-muted-foreground">
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
