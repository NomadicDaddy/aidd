import type { ProjectDetail, ProjectGitStatusSummary } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { fieldLabelClass } from '../../../lib/formStyles.ts';
import { GitStatusBadge } from '../GitStatusBadge.tsx';
import { bucketLabels } from '../projects-list-shared.ts';
import { artifactTone } from './shared.ts';

function StatusCell({ children, label }: { children: React.ReactNode; label: string }) {
	return (
		<div className="min-w-0 space-y-1">
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
		<Card aria-label="Project status" variant="sunken">
			<div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 xl:grid-cols-6">
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
				<StatusCell label="Working tree">
					<GitStatusBadge className="max-w-full" status={gitStatus} />
				</StatusCell>
				<StatusCell label="Profile source">
					<Badge title={`Profile source: ${metadata.profile.source}`} tone="neutral">
						{metadata.profile.source}
					</Badge>
				</StatusCell>
			</div>
		</Card>
	);
}
