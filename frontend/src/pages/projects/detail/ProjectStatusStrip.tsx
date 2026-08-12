import type { ProjectDetail, ProjectGitStatusSummary } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { fieldLabelClass } from '../../../lib/formStyles.ts';
import { GitStatusBadge } from '../GitStatusBadge.tsx';
import { bucketLabels } from '../projects-list-shared.ts';
import { artifactTone } from './shared.ts';

function StatusCell({
	children,
	className,
	label,
}: {
	children: React.ReactNode;
	className?: string;
	label: string;
}) {
	return (
		<div className={`min-w-0 space-y-1 ${className ?? ''}`}>
			<span className={`block ${fieldLabelClass}`}>{label}</span>
			{children}
		</div>
	);
}

/**
 * The project's six status dimensions, under their own labels.
 *
 * These used to sit in the PageHeader `actions` slot as a bare run of Badges — a ~640px wall that
 * out-weighed the h1 and, at 768, stopped the header stacking at all. Worse, the values were
 * undiscoverable: nothing on screen or in the accessibility tree said that "stale" was artifact
 * health and "explicit" was where the profile came from.
 */
export function ProjectStatusStrip({
	gitStatus,
	project,
}: {
	gitStatus: ProjectGitStatusSummary | undefined;
	project: ProjectDetail;
}) {
	const { metadata } = project;
	return (
		// Containment sits outside the card, so the query measures the content column rather than the
		// column minus the card's own padding. See the content-width table in AppLayout.tsx.
		<div className="@container">
			<Card aria-label="Project status" variant="sunken">
				{/* `max-w-[76rem]` past the last step: at 2250 the six tracks resolved to 308px each
				    across a 1928px container, and every one holds a 2xs label over a short value
				    like "coding" or "v2.0", so ~250px of each track was empty and six related facts
				    read as six unrelated islands. The cap leaves 1024-1440 exactly as measured. */}
				<div className="grid max-w-[76rem] grid-cols-2 gap-x-4 gap-y-3 @min-[32rem]:grid-cols-3 @min-[68rem]:grid-cols-6">
					<StatusCell label="Artifact health">
						<Badge
							title={`Artifact health: ${project.artifactHealth}`}
							tone={artifactTone[project.artifactHealth]}>
							{project.artifactHealth}
						</Badge>
					</StatusCell>
					<StatusCell label="Phase">
						<Badge title={`Phase: ${project.phase}`} tone="neutral">
							{project.phase}
						</Badge>
					</StatusCell>
					<StatusCell label="Milestone">
						{metadata.roadmap?.currentMilestone ? (
							<Badge
								title={`Current milestone: ${metadata.roadmap.currentMilestone}`}
								tone="neutral">
								{metadata.roadmap.currentMilestone}
							</Badge>
						) : (
							<span className="text-xs text-muted-foreground">—</span>
						)}
					</StatusCell>
					<StatusCell label="Profile">
						<Badge
							title={`Assurance profile: ${bucketLabels[metadata.profile.bucket]}`}
							tone="neutral">
							{bucketLabels[metadata.profile.bucket]}
						</Badge>
					</StatusCell>
					<StatusCell className="col-span-2 @min-[32rem]:col-span-1" label="Working tree">
						<GitStatusBadge className="max-w-full" status={gitStatus} />
					</StatusCell>
					<StatusCell label="Profile source">
						<Badge title={`Profile source: ${metadata.profile.source}`} tone="neutral">
							{metadata.profile.source}
						</Badge>
					</StatusCell>
				</div>
			</Card>
		</div>
	);
}
