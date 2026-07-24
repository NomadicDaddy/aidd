import { default as FolderX } from 'lucide-react/dist/esm/icons/folder-x';

import type { PortStatusEntry, ProjectSummary } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { percent } from '../../lib/formatters.ts';
import { toneSolid } from '../../lib/tones.ts';
import { artifactTone } from '../projects/projects-list-shared.ts';
import { isOrphaned, milestoneBadgeTone } from '../projects/projects-list-visuals.ts';
import { getHealthTone, healthBandLabel } from './dashboard-shared.ts';

function DashboardPortDot({ listening }: { listening: boolean | null }) {
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

export function ProjectHealthRow({
	portStatus,
	project,
}: {
	portStatus: PortStatusEntry | undefined;
	project: ProjectSummary;
}) {
	const score = project.priorityHealth.score;
	const tone = getHealthTone(score);
	const featureScore = percent(project.featureStats.passing, project.featureStats.total);
	const orphan = isOrphaned(project);
	const summary = project.metadata.artifactCheck?.summary ?? null;
	const artifactTooltip = summary
		? `${summary.fresh} fresh · ${summary.stale} stale · ${summary.missing} missing`
		: undefined;
	const milestoneOrder = project.metadata.roadmap?.milestoneOrder ?? [];
	const milestones = project.metadata.roadmap?.milestones ?? {};
	const visibleMilestones = milestoneOrder.slice(0, 3);
	const hiddenMilestones = milestoneOrder.length - visibleMilestones.length;
	const ports = project.metadata.ports;

	return (
		<div className="rounded-md border border-neutral-200/80 bg-white/70 p-3 transition-[border-color,background-color] duration-150 hover:border-teal-300 hover:bg-teal-50/50 dark:border-neutral-800/80 dark:bg-slate-950/60 dark:hover:border-teal-800 dark:hover:bg-teal-950/20">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="text-foreground flex items-center gap-1.5 truncate text-sm font-medium">
						{orphan ? (
							<FolderX
								aria-label="Missing on disk"
								className="h-3.5 w-3.5 shrink-0 text-amber-500"
							/>
						) : null}
						<span className="truncate">{project.name}</span>
					</div>
					<div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
						{project.path}
					</div>
				</div>
				<div className="flex flex-col items-end gap-1">
					<Badge showDot tone={tone}>
						{score}%
					</Badge>
					<span title={artifactTooltip}>
						<Badge tone={artifactTone[project.artifactHealth]}>
							{project.artifactHealth}
						</Badge>
					</span>
				</div>
			</div>
			{visibleMilestones.length > 0 ? (
				<div className="mt-2 flex flex-wrap gap-1">
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
			<div className="mt-2 flex items-center justify-between gap-3 text-xs text-neutral-500 dark:text-neutral-400">
				<div className="flex items-center gap-2 truncate">
					<span className="truncate">{healthBandLabel(project.priorityHealth.band)}</span>
					{ports && (ports.frontendPort !== null || ports.backendPort !== null) ? (
						<span className="inline-flex items-center gap-1 font-mono">
							{ports.frontendPort !== null ? (
								<span className="inline-flex items-center gap-1">
									<DashboardPortDot listening={portStatus?.frontend ?? null} />
									{ports.frontendPort}
								</span>
							) : null}
							{ports.backendPort !== null ? (
								<span className="inline-flex items-center gap-1">
									<DashboardPortDot listening={portStatus?.backend ?? null} />
									{ports.backendPort}
								</span>
							) : null}
						</span>
					) : null}
				</div>
				<span className="tabular-nums">
					{project.featureStats.passing}/{project.featureStats.total}
				</span>
			</div>
			<div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-slate-800">
				<div
					aria-hidden="true"
					className={`h-full rounded-full ${toneSolid[tone]}`}
					style={{ width: `${featureScore}%` }}
				/>
			</div>
		</div>
	);
}
