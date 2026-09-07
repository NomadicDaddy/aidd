import { default as FolderX } from 'lucide-react/dist/esm/icons/folder-x';

import type { DashboardProjectSummary } from '../../api/types.ts';

import { FilePath } from '../../components/shared/FilePath.tsx';
import { Badge, StatusDot } from '../../components/ui/badge.tsx';
import { percent } from '../../lib/formatters.ts';
import { toneSolid, toneText } from '../../lib/tones.ts';
import { artifactTone } from '../projects/projects-list-shared.ts';
import { milestoneBadgeTone } from '../projects/projects-list-visuals.ts';
import { getHealthTone, healthBandLabel } from './dashboard-shared.ts';

function DashboardPortDot({ listening }: { listening: boolean | null }) {
	if (listening === null) return null;
	return (
		// The label rides on the wrapper because `StatusDot` is `aria-hidden`, and the wrapper takes
		// `role="img"` so the label is allowed to exist: `aria-label` on a generic `<span>` is
		// prohibited by name-from-author rules, so the listening state was nameless to assistive
		// technology. Same contract as `PortDotInline` in ProjectCardMetrics.tsx.
		<span
			aria-label={listening ? 'Listening' : 'Not listening'}
			className="inline-flex items-center"
			role="img"
			title={listening ? 'Listening' : 'Not listening'}>
			<StatusDot tone={listening ? 'emerald' : 'red'} />
		</span>
	);
}

// Every field this row reads is already bounded and projected by the dashboard-summary endpoint:
// the three milestone chips, the `+N` remainder, the artifact counts and the port listen state.
// It used to derive them from a full `ProjectSummary`, which is why the page downloaded one.
export function ProjectHealthRow({ project }: { project: DashboardProjectSummary }) {
	const score = project.priorityScore;
	const tone = getHealthTone(score);
	const featureScore = percent(project.featurePassing, project.featureTotal);
	const orphan = project.orphaned;
	const counts = project.artifactCounts;
	const artifactTooltip = counts
		? `${counts.fresh} fresh · ${counts.stale} stale · ${counts.missing} missing`
		: undefined;
	const visibleMilestones = project.milestones;
	const hiddenMilestones = project.hiddenMilestoneCount;
	const ports = project.ports;
	const portStatus = project.portStatus;

	return (
		<div
			// A neutral tracking tint, not an accent pair. The page has two hover vocabularies and
			// they must not be reversed: an accent hover on this row or the Director Queue row would
			// promise something to click at row level where there is nothing, while the Feature
			// Status rows — whose Feature cell is a real link to the project's features tab — offer
			// only the title underline. `bg-muted/40` is what the Feature Status `<tr>` and the
			// Projects table row use for "you are on this row"; accent stays reserved for an
			// element that acts when clicked.
			className="rounded-md border border-border/80 bg-card/70 p-3 transition-colors duration-150 hover:bg-muted/40">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
						{orphan ? (
							<FolderX
								aria-label="Missing on disk"
								className={`h-3.5 w-3.5 shrink-0 ${toneText.amber}`}
							/>
						) : null}
						<span className="truncate">{project.name}</span>
					</div>
					<FilePath
						className="block truncate text-xs text-muted-foreground"
						path={project.path}
					/>
				</div>
				<div className="flex flex-col items-end gap-1">
					{/* Two percentages live in this row — this score and the completion bar at the
					    bottom — and the badge said only "93%". Naming it here is the whole fix; a
					    visible label would not fit at badge size beside the artifact chip. */}
					<span title={`Priority health ${score}%`}>
						<Badge showDot tone={tone}>
							{score}%
						</Badge>
					</span>
					<span title={artifactTooltip}>
						<Badge tone={artifactTone[project.artifactHealth]}>
							{project.artifactHealth}
						</Badge>
					</span>
				</div>
			</div>
			{visibleMilestones.length > 0 ? (
				<div className="mt-2 flex flex-wrap gap-1">
					{visibleMilestones.map((milestone) => (
						<Badge key={milestone.name} tone={milestoneBadgeTone(milestone)}>
							<span className="font-medium">{milestone.name}</span>
							<span className="ml-1 tabular-nums">
								{milestone.completed}/{milestone.total}
							</span>
						</Badge>
					))}
					{hiddenMilestones > 0 ? (
						<Badge tone="neutral">+{hiddenMilestones}</Badge>
					) : null}
				</div>
			) : null}
			<div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
				<div className="flex items-center gap-2 truncate">
					<span className="truncate">{healthBandLabel(project.priorityBand)}</span>
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
				{project.milestoneCount === 1 ? null : (
					<span className="tabular-nums">
						{project.featurePassing}/{project.featureTotal}
					</span>
				)}
			</div>
			{/* The fill encodes one thing: feature completion. Taking the priority-health hue as
			    well would paint a 237/238 bar solid red above an 8/8 bar painted green and leave no
			    way to tell whether length or colour is the measure. The band keeps its own Badge at
			    the top-right of this row. */}
			<div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
				<div
					aria-hidden="true"
					className={`h-full rounded-full ${toneSolid.teal}`}
					style={{ width: `${featureScore}%` }}
				/>
			</div>
		</div>
	);
}
