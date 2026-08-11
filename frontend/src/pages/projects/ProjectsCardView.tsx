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
			{/* The grid decides its own column count from a card width rather than from viewport
			    steps, which capped it at three however wide the column got. At 2250 that meant
			    three 643px cards in a 1962px column, and nothing on a project card is 643px wide:
			    the metric list's value column held `0/61` and `10` in 210px, so all eleven rows
			    ended in ~185px of void, twice over. 30rem is the card's real minimum — below it the
			    metric list drops to one column and the badge run starts wrapping — so `auto-fill`
			    gives four ~490px cards at 1962, three at 1920, and two at 1440 and 1280 instead of
			    three starved ones. At 768 it settles on one, which is what the old `lg` floor was
			    protecting: two ~215px cards broke the project path mid-token. */}
			<div className="grid grid-cols-[repeat(auto-fill,minmax(30rem,1fr))] gap-4">
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
