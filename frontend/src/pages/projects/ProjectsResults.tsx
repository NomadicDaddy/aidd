import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';

import type { AppLaunch, ProjectGitStatusMapEntry, ProjectSummary } from '../../api/types.ts';
import type { FilterRegister } from '../../lib/filterFields.ts';
import type { SortDir, SortKey } from './projects-list-sort.ts';
import type { ProjectsResultsState } from './projects-results-state.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { SkeletonCards, SkeletonRows } from '../../components/shared/LoadingState.tsx';
import { Button } from '../../components/ui/button.tsx';
import { useAppLaunches } from '../../hooks/useAppLauncher.ts';
import { usePortStatus } from '../../hooks/useProjects.ts';
import { ProjectsCardView } from './ProjectsCardView.tsx';
import { ProjectsTableView } from './ProjectsTableView.tsx';

export function ProjectsResults({
	emptyFilters,
	gitStatus,
	onRefresh,
	onToggleSort,
	projectView,
	sortDir,
	sortKey,
	spernakitTemplateVersion = null,
	state,
}: {
	/** The filters that narrowed the list to nothing, when any are in force. */
	emptyFilters: FilterRegister | undefined;
	gitStatus: Record<string, ProjectGitStatusMapEntry> | undefined;
	onRefresh: () => void;
	onToggleSort: (key: SortKey) => void;
	projectView: 'cards' | 'table';
	sortDir: SortDir;
	sortKey: SortKey;
	spernakitTemplateVersion?: null | string;
	state: ProjectsResultsState;
}) {
	switch (state.type) {
		case 'loading':
			return <LoadingProjectsResults projectView={projectView} />;
		case 'no_discovered':
			return <NoDiscoveredProjects onRefresh={onRefresh} />;
		case 'no_match':
			return (
				<NoMatchingProjects
					allProjectsCount={state.allProjectsCount}
					filters={emptyFilters}
				/>
			);
		case 'no_registered':
			return <NoRegisteredProjects onRefresh={onRefresh} />;
		case 'ready':
			return (
				<ProjectsResultsView
					gitStatus={gitStatus}
					onToggleSort={onToggleSort}
					projectView={projectView}
					sortDir={sortDir}
					sorted={state.projects}
					sortKey={sortKey}
					spernakitTemplateVersion={spernakitTemplateVersion}
				/>
			);
	}
}

function LoadingProjectsResults({ projectView }: { projectView: 'cards' | 'table' }) {
	return projectView === 'table' ? (
		<SkeletonRows columns={7} count={6} label="Loading projects…" />
	) : (
		<SkeletonCards count={6} label="Loading projects…" />
	);
}

// Three empty registers on one surface, and until this they were three hand-rolled centred cards
// that differed only in their sentences. Absence and unreachability keep an action that changes the
// world outside the page; only the narrowed one carries filters, and it no longer needs to explain
// in prose that clearing them would help.
function NoRegisteredProjects({ onRefresh }: { onRefresh: () => void }) {
	return (
		<EmptyState
			action={
				<Button onClick={onRefresh}>
					<RefreshCw className="h-4 w-4" />
					Discover Projects
				</Button>
			}>
			<p className="font-medium text-foreground">
				No registered project roots are reachable.
			</p>
			<p className="mt-1 text-xs">
				Every configured allowed root was skipped during discovery. Fix the configured paths
				in Settings and click Discover Projects to retry.
			</p>
		</EmptyState>
	);
}

function NoDiscoveredProjects({ onRefresh }: { onRefresh: () => void }) {
	return (
		<EmptyState
			action={
				<Button onClick={onRefresh}>
					<RefreshCw className="h-4 w-4" />
					Discover Projects
				</Button>
			}>
			<p className="font-medium text-foreground">
				No projects discovered under the configured roots.
			</p>
			<p className="mt-1 text-xs">
				Add a project with a <code>.aidd/</code> directory under one of your configured
				roots, or add another root in Settings, then click Discover Projects.
			</p>
		</EmptyState>
	);
}

function NoMatchingProjects({
	allProjectsCount,
	filters,
}: {
	allProjectsCount: number;
	filters: FilterRegister | undefined;
}) {
	return (
		<EmptyState filterReset="toolbar" filters={filters}>
			<p className="font-medium text-foreground">No projects match the active filters.</p>
			<p className="mt-1 text-xs">
				{allProjectsCount} project{allProjectsCount === 1 ? '' : 's'} discovered.
			</p>
		</EmptyState>
	);
}

function ProjectsResultsView({
	gitStatus,
	onToggleSort,
	projectView,
	sortDir,
	sorted,
	sortKey,
	spernakitTemplateVersion = null,
}: {
	gitStatus: Record<string, ProjectGitStatusMapEntry> | undefined;
	onToggleSort: (key: SortKey) => void;
	projectView: 'cards' | 'table';
	sortDir: SortDir;
	sorted: ProjectSummary[];
	sortKey: SortKey;
	spernakitTemplateVersion?: null | string;
}) {
	const launches = useAppLaunches();
	const portStatus = usePortStatus();
	const statusByProjectId = ((): Map<string, AppLaunch> => {
		const map = new Map<string, AppLaunch>();
		for (const launch of launches.data ?? []) {
			map.set(launch.projectId, launch);
		}
		return map;
	})();

	if (projectView === 'cards') {
		return (
			<ProjectsCardView
				gitStatus={gitStatus}
				portStatus={portStatus.data}
				projects={sorted}
				spernakitTemplateVersion={spernakitTemplateVersion}
				statusByProjectId={statusByProjectId}
			/>
		);
	}

	return (
		<ProjectsTableView
			gitStatus={gitStatus}
			onToggleSort={onToggleSort}
			portStatus={portStatus.data}
			projects={sorted}
			sortDir={sortDir}
			sortKey={sortKey}
			spernakitTemplateVersion={spernakitTemplateVersion}
		/>
	);
}
