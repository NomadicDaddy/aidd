import { default as ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down';
import { default as FolderKanban } from 'lucide-react/dist/esm/icons/folder-kanban';
import { type ReactElement, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useProjectNames } from '../../hooks/useProjects.ts';
import { cn } from '../../lib/cn.ts';
import { projectDetailTarget } from './project-nav-target.ts';

const projectsPath = '/projects';
const projectOptionClass = 'bg-white text-neutral-950 dark:bg-slate-950 dark:text-neutral-50';

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
		[projectsQuery.data?.projects]
	);
	const currentProject = projects.find(
		(project) => projectDetailTarget(project.routeId, '') === location.pathname
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
				'group relative flex h-10 w-10 shrink-0 items-center justify-center gap-3 rounded-md px-0 text-sm font-medium sm:w-auto sm:justify-start sm:px-3',
				'transition-[background-color,color,box-shadow] duration-150 focus-within:ring-2 focus-within:ring-cyan-400 focus-within:ring-offset-2 focus-within:ring-offset-white dark:focus-within:ring-cyan-300 dark:focus-within:ring-offset-slate-950',
				active
					? 'bg-slate-950 text-white shadow-sm shadow-cyan-950/10 dark:bg-cyan-400 dark:text-slate-950'
					: 'text-neutral-700 hover:bg-cyan-50 hover:text-cyan-950 dark:text-neutral-300 dark:hover:bg-cyan-950/30 dark:hover:text-cyan-100'
			)}
			title={label}>
			<span
				aria-hidden="true"
				className={cn(
					'absolute top-2 left-0 hidden h-6 w-0.5 rounded-full bg-cyan-400 transition-opacity sm:block',
					active ? 'opacity-100' : 'opacity-0'
				)}
			/>
			<FolderKanban aria-hidden="true" className="h-4 w-4 shrink-0" />
			<span
				className={cn(
					'min-w-0 flex-1 truncate',
					collapsed ? 'hidden' : 'hidden sm:inline'
				)}>
				{label}
			</span>
			<ChevronDown
				aria-hidden="true"
				className={cn('h-3.5 w-3.5 shrink-0', collapsed ? 'hidden' : 'hidden sm:block')}
			/>
			<select
				aria-label="Projects navigation"
				className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-white text-neutral-950 opacity-0 dark:bg-slate-950 dark:text-neutral-50 dark:[color-scheme:dark]"
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
