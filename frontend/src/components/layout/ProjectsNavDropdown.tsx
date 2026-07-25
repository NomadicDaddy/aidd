import { default as ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down';
import { default as FolderKanban } from 'lucide-react/dist/esm/icons/folder-kanban';
import { type ReactElement, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useProjectNames } from '../../hooks/useProjects.ts';
import { cn } from '../../lib/cn.ts';
import { projectDetailTarget } from './project-nav-target.ts';

const projectsPath = '/projects';
const projectOptionClass = 'bg-background text-foreground';

interface ProjectsNavDropdownProps {
	collapsed: boolean;
}

export function ProjectsNavDropdown({ collapsed }: ProjectsNavDropdownProps): ReactElement {
	const location = useLocation();
	const navigate = useNavigate();
	const projectsQuery = useProjectNames();
	const projects = useMemo(
		() =>
			(projectsQuery.data?.projects ?? [])
				.filter((project) => !project.name.endsWith('.old'))
				.sort((left, right) => left.name.localeCompare(right.name)),
		[projectsQuery.data?.projects],
	);
	const currentProject = projects.find(
		(project) => projectDetailTarget(project.routeId, '') === location.pathname,
	);
	const onProjectsIndex =
		location.pathname === projectsPath || location.pathname === `${projectsPath}/`;
	const active = onProjectsIndex || location.pathname.startsWith(`${projectsPath}/`);
	let selectedPath = '';
	if (currentProject) {
		selectedPath = projectDetailTarget(currentProject.routeId, location.search);
	} else if (onProjectsIndex) {
		selectedPath = projectsPath;
	}
	const label = currentProject?.name ?? 'Projects';

	return (
		<div
			className={cn(
				'group relative flex h-11 w-11 shrink-0 items-center justify-center gap-2.5 rounded-lg px-0 text-sm font-medium sm:h-9 sm:w-auto sm:justify-start sm:px-3',
				'transition-all duration-150 focus-within:ring-2 focus-within:ring-ring/50 focus-within:ring-offset-2 focus-within:ring-offset-background',
				active
					? 'bg-accent-muted text-accent-muted-foreground shadow-sm'
					: 'text-muted-foreground hover:bg-muted hover:text-foreground',
			)}
			title={label}>
			<span
				aria-hidden="true"
				className={cn(
					'absolute top-1.5 left-0 hidden h-6 w-[3px] rounded-full bg-accent transition-opacity sm:block',
					active ? 'opacity-100' : 'opacity-0',
				)}
			/>
			<FolderKanban aria-hidden="true" className="h-4 w-4 shrink-0" />
			<span
				className={cn(
					'min-w-0 flex-1 truncate',
					collapsed ? 'hidden' : 'hidden sm:inline',
				)}>
				{label}
			</span>
			<ChevronDown
				aria-hidden="true"
				className={cn('h-3.5 w-3.5 shrink-0', collapsed ? 'hidden' : 'hidden sm:block')}
			/>
			<select
				aria-label="Projects navigation"
				className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-background text-foreground opacity-0 dark:[color-scheme:dark]"
				onChange={(event) => {
					void navigate(event.target.value);
				}}
				value={selectedPath}>
				{selectedPath === '' && (
					<option className={projectOptionClass} disabled hidden value="">
						Choose a destination
					</option>
				)}
				<option className={projectOptionClass} value={projectsPath}>
					Projects
				</option>
				{projects.map((project) => (
					<option
						className={projectOptionClass}
						key={project.id}
						value={projectDetailTarget(project.routeId, location.search)}>
						{project.name}
					</option>
				))}
			</select>
		</div>
	);
}
