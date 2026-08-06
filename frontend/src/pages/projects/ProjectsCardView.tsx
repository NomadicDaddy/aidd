import type {
	AppLaunch,
	PortStatusEntry,
	ProjectGitStatusMapEntry,
	ProjectSummary,
} from '../../api/types.ts';
import type { SortDir, SortKey } from './projects-list-sort.ts';

import { AppLaunchControl } from '../../components/shared/AppLaunchControl.tsx';
import { ProjectCard } from './ProjectCard.tsx';
import { ProjectsCardSort } from './ProjectsCardSort.tsx';

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
		<div className="space-y-2">
			<ProjectsCardSort onToggleSort={onToggleSort} sortDir={sortDir} sortKey={sortKey} />
			{/* Two columns only from `lg`: at 768 the `md` grid held two ~215px cards, which broke
			    the project path mid-token and pushed the badge run onto four rows for the same
			    information. */}
			<div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
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
