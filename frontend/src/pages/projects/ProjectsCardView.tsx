import { useState } from 'react';

import type {
	AppLaunch,
	PortStatusEntry,
	ProjectGitStatusMapEntry,
	ProjectSummary,
} from '../../api/types.ts';

import { AppLaunchControl } from '../../components/shared/AppLaunchControl.tsx';
import { clampPage } from './detail/pagination-utils.ts';
import { Pagination } from './detail/Pagination.tsx';
import { ProjectCard } from './ProjectCard.tsx';

const PROJECTS_PAGE_SIZE = 12;

export function ProjectsCardView({
	gitStatus,
	portStatus,
	projects,
	spernakitTemplateVersion = null,
	statusByProjectId,
}: {
	gitStatus: Record<string, ProjectGitStatusMapEntry> | undefined;
	portStatus: Record<string, PortStatusEntry> | undefined;
	projects: ProjectSummary[];
	spernakitTemplateVersion?: null | string;
	statusByProjectId: Map<string, AppLaunch>;
}) {
	const [page, setPage] = useState(0);
	const activePage = clampPage(page, projects.length, PROJECTS_PAGE_SIZE);
	const visibleProjects = projects.slice(
		activePage * PROJECTS_PAGE_SIZE,
		(activePage + 1) * PROJECTS_PAGE_SIZE,
	);
	return (
		<div className="@container">
			{/* Below the card's real 30rem minimum the track must shrink with the content column:
			    `minmax(30rem, 1fr)` alone would still force a 480px card into the supported 358px
			    mobile column. Once 30rem is available, auto-fill chooses density from this
			    container rather than the viewport. The standard gap remains part of the card
			    composition at every width; column count yields before the gutter does. */}
			<div className="grid grid-cols-1 gap-4 @min-[30rem]:grid-cols-[repeat(auto-fill,minmax(30rem,1fr))]">
				{visibleProjects.map((project) => (
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
			<Pagination
				onChange={setPage}
				page={activePage}
				pageSize={PROJECTS_PAGE_SIZE}
				total={projects.length}
			/>
		</div>
	);
}
