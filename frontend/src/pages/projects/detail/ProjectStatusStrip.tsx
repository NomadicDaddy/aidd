import type { ProjectDetail, ProjectGitStatusSummary } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { fieldLabelClass } from '../../../lib/formStyles.ts';
import { GitStatusBadge } from '../GitStatusBadge.tsx';
import { bucketLabels } from '../projects-list-shared.ts';

function StatusCell({
	children,
	className,
	label,
	shortLabel,
}: {
	children: React.ReactNode;
	className?: string;
	label: string;
	shortLabel?: string;
}) {
	return (
		<div className={`min-w-0 space-y-1 ${className ?? ''}`}>
			<dt className={`block ${fieldLabelClass}`}>
				<span className="sm:hidden">{shortLabel ?? label}</span>
				<span className="hidden sm:inline">{label}</span>
			</dt>
			<dd>{children}</dd>
		</div>
	);
}

/**
 * The page-global project status dimensions, under their own labels.
 *
 * Not a bare run of Badges in the PageHeader `actions` slot: that is a ~640px wall that out-weighs
 * the h1 and, at 768, stops the header stacking at all. Worse, the values would be undiscoverable —
 * nothing on screen or in the accessibility tree saying that "stale" is artifact health and
 * "explicit" is where the profile came from.
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
		/* Artifact health, lifecycle phase, and milestone have richer, linked owners in the Overview
		   metric row. The three remaining page-global facts are an inline definition list, not a
		   full-rail card whose surface is mostly empty at desktop widths. */
		<dl
			aria-label="Project status"
			className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,0.8fr)] gap-x-2 border-y border-border py-2 sm:flex sm:flex-wrap sm:gap-x-10 sm:py-3">
			<StatusCell label="Profile">
				<Badge
					title={`Assurance profile: ${bucketLabels[metadata.profile.bucket]}`}
					tone="neutral">
					{bucketLabels[metadata.profile.bucket]}
				</Badge>
			</StatusCell>
			<StatusCell label="Profile source" shortLabel="Source">
				<Badge title={`Profile source: ${metadata.profile.source}`} tone="neutral">
					{metadata.profile.source}
				</Badge>
			</StatusCell>
			<StatusCell label="Working tree" shortLabel="Tree">
				<GitStatusBadge className="max-w-full" status={gitStatus} />
			</StatusCell>
		</dl>
	);
}
