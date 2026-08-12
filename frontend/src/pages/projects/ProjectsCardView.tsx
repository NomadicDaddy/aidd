import type {
	AppLaunch,
	PortStatusEntry,
	ProjectGitStatusMapEntry,
	ProjectSummary,
} from '../../api/types.ts';
import type { SortDir, SortKey } from './projects-list-sort.ts';

import { AppLaunchControl } from '../../components/shared/AppLaunchControl.tsx';
import { CardSortControl } from '../../components/shared/CardSortControl.tsx';
import { ProjectCard } from './ProjectCard.tsx';
import { projectSortOptions } from './projects-table-columns.ts';

export function ProjectsCardView({
	gitStatus,
	onToggleSort,
	portStatus,
	projects,
	sortDir,
	sortKey,
	spernakitTemplateVersion = null,
	statusByProjectId,
}: {
	gitStatus: Record<string, ProjectGitStatusMapEntry> | undefined;
	onToggleSort: (key: SortKey) => void;
	portStatus: Record<string, PortStatusEntry> | undefined;
	projects: ProjectSummary[];
	sortDir: SortDir;
	sortKey: SortKey;
	spernakitTemplateVersion?: null | string;
	statusByProjectId: Map<string, AppLaunch>;
}) {
	return (
		<div className="@container space-y-2">
			<CardSortControl
				onToggleSort={onToggleSort}
				options={projectSortOptions}
				sortDir={sortDir}
				sortKey={sortKey}
			/>
			{/* Below the card's real 30rem minimum the track must shrink with the content column:
			    `minmax(30rem, 1fr)` alone forced a 480px card into the supported 358px mobile
			    column. Once 30rem is available, auto-fill chooses the density from this container
			    rather than the viewport. ProjectCardMetrics uses the same 30rem step for its own
			    two-column transition, so the 499px metric region produced by three cards at 1920
			    remains compact instead of regressing to a taller one-column list. */}
			<div className="grid grid-cols-1 gap-4 @min-[30rem]:grid-cols-[repeat(auto-fill,minmax(30rem,1fr))]">
				{projects.map((project) => (
					// The project name is the navigation target (a real react-router link, as the
					// table view already does) rather than a stretched empty overlay whose clicks
					// in-flow card content could intercept; the launch control stays independently
					// clickable in the card's footer slot.
					<ProjectCard
						action={
							<AppLaunchControl
								accessibleContext={project.name}
								compact
								projectId={project.id}
								selfFetch={false}
								status={statusByProjectId.get(project.id)}
							/>
						}
						detailHref={`/projects/${encodeURIComponent(project.routeId)}`}
						gitStatus={gitStatus?.[project.id]?.status}
						key={project.id}
						portStatus={portStatus?.[project.id]}
						project={project}
						spernakitTemplateVersion={spernakitTemplateVersion}
					/>
				))}
			</div>
		</div>
	);
}
