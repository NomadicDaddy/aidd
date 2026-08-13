import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';

import type { AppLaunch, ProjectGitStatusMapEntry, ProjectSummary } from '../../api/types.ts';
import type { SortDir, SortKey } from './projects-list-sort.ts';
import type { ProjectsResultsState } from './projects-results-state.ts';

import { SkeletonCards, SkeletonRows } from '../../components/shared/LoadingState.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { useAppLaunches } from '../../hooks/useAppLauncher.ts';
import { usePortStatus } from '../../hooks/useProjects.ts';
import { ProjectsCardView } from './ProjectsCardView.tsx';
import { ProjectsTableView } from './ProjectsTableView.tsx';

export function ProjectsResults({
	gitStatus,
	onRefresh,
	onResetFilters,
	onToggleSort,
	projectView,
	sortDir,
	sortKey,
	spernakitTemplateVersion = null,
	state,
}: {
	gitStatus: Record<string, ProjectGitStatusMapEntry> | undefined;
	onRefresh: () => void;
	onResetFilters: () => void;
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
					onResetFilters={onResetFilters}
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

function NoRegisteredProjects({ onRefresh }: { onRefresh: () => void }) {
	return (
		<Card className="flex flex-col items-center justify-center gap-3 py-10 text-center">
			<p className="text-sm font-medium text-foreground">
				No registered project roots are reachable.
			</p>
			<p className="text-xs text-muted-foreground">
				Every configured allowed root was skipped during discovery. Fix the configured paths
				in Settings and click Discover Projects to retry.
			</p>
			<Button onClick={onRefresh}>
				<RefreshCw className="h-4 w-4" />
				Discover Projects
			</Button>
		</Card>
	);
}

function NoDiscoveredProjects({ onRefresh }: { onRefresh: () => void }) {
	return (
		<Card className="flex flex-col items-center justify-center gap-3 py-10 text-center">
			<p className="text-sm font-medium text-foreground">
				No projects discovered under the configured roots.
			</p>
			<p className="text-xs text-muted-foreground">
				Add a project with a <code>.aidd/</code> directory under one of your configured
				roots, or add another root in Settings, then click Discover Projects.
			</p>
			<Button onClick={onRefresh}>
				<RefreshCw className="h-4 w-4" />
				Discover Projects
			</Button>
		</Card>
	);
}

function NoMatchingProjects({
	allProjectsCount,
	onResetFilters,
}: {
	allProjectsCount: number;
	onResetFilters: () => void;
}) {
	return (
		<Card className="flex flex-col items-center justify-center gap-3 py-10 text-center">
			<p className="text-sm font-medium text-foreground">
				No projects match the active filters.
			</p>
			<p className="text-xs text-muted-foreground">
				{allProjectsCount} project{allProjectsCount === 1 ? '' : 's'} discovered; clear
				filters to see all of them.
			</p>
			<Button onClick={onResetFilters} variant="secondary">
				Clear filters
			</Button>
		</Card>
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
				onToggleSort={onToggleSort}
				portStatus={portStatus.data}
				projects={sorted}
				sortDir={sortDir}
				sortKey={sortKey}
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
