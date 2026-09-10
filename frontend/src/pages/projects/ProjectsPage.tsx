/* eslint-disable @typescript-eslint/no-misused-promises */
import { useState } from 'react';
import { toast } from 'sonner';

import { CardSortControl } from '../../components/shared/CardSortControl.tsx';
import { ColumnChooser } from '../../components/shared/ColumnChooser.tsx';
import { DataFreshness } from '../../components/shared/DataFreshness.tsx';
import { ErrorState } from '../../components/shared/ErrorState.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { PageRail } from '../../components/shared/PageRail.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { useProjects, useProjectsGitStatus } from '../../hooks/useProjects.ts';
import { useSettingsConfig } from '../../hooks/useSettings.ts';
import { pageRailByContentType } from '../../lib/contentRails.ts';
import { usePrefsStore } from '../../stores/prefsStore.ts';
import { ProjectInitFailures } from './ProjectInitFailures.tsx';
import { type IntakeLane, ProjectIntakePanel } from './ProjectIntakePanel.tsx';
import { resolveProjectsResultsState } from './projects-results-state.ts';
import {
	optionalProjectColumns,
	projectSortOptions,
	readOptionalColumns,
} from './projects-table-columns.ts';
import { ProjectsPageActions } from './ProjectsPageActions.tsx';
import { ProjectsResults } from './ProjectsResults.tsx';
import { ProjectsToolbar } from './ProjectsToolbar.tsx';
import { SkippedRootsWarning } from './SkippedRootsWarning.tsx';
import { useProjectsPageFilters } from './useProjectsFilters.ts';

const PAGE_RAIL = pageRailByContentType.catalog;

export function ProjectsPage() {
	useDocumentTitle('Projects');
	const projects = useProjects();
	const gitStatus = useProjectsGitStatus();
	const projectView = usePrefsStore((state) => state.projectView);
	const setProjectView = usePrefsStore((state) => state.setProjectView);
	const storedColumns = usePrefsStore((state) => state.projectTableColumns);
	const setStoredColumns = usePrefsStore((state) => state.setProjectTableColumns);
	const [intakeLane, setIntakeLane] = useState<IntakeLane | null>(null);
	const [skippedDismissed, setSkippedDismissed] = useState(false);

	const settingsConfig = useSettingsConfig();
	const showSpernakitProject = settingsConfig.data?.showSpernakitProject ?? false;
	const discoveredProjects = projects.data?.projects ?? [];
	const allProjects = showSpernakitProject
		? discoveredProjects
		: discoveredProjects.filter((project) => !project.isSpernakitTemplate);
	const hiddenSpernakitCount = discoveredProjects.length - allProjects.length;
	const skippedRoots = projects.data?.skippedRoots ?? [];
	const initFailures = projects.data?.initFailures ?? [];

	const {
		emptyFilters,
		hasFilters,
		maturityFilter,
		milestoneFilter,
		milestoneOptions,
		phaseFilter,
		query,
		resetFilters,
		rootFilter,
		rootOptions,
		sortDir,
		sorted,
		sortKey,
		syncFilter,
		toggleSort,
		updateParam,
	} = useProjectsPageFilters(
		allProjects,
		skippedRoots,
		projects.data !== undefined,
		gitStatus.data?.projects,
	);

	async function handleRefresh(): Promise<boolean> {
		setSkippedDismissed(false);
		try {
			const result = await projects.refetch({ throwOnError: true });
			if (result.error) {
				throw result.error;
			}
			const discovered = result.data?.projects ?? [];
			if (discovered.length === 0) {
				toast.info('No projects discovered');
			} else {
				toast.success(
					`Found ${discovered.length} project${discovered.length === 1 ? '' : 's'}`,
				);
			}
			return true;
		} catch (error) {
			toast.error('Discovery failed', {
				description:
					error instanceof Error ? error.message : 'Unknown error during discovery.',
			});
			return false;
		}
	}

	const resultsState = resolveProjectsResultsState({
		allProjectsCount: allProjects.length,
		isError: projects.isError,
		isLoading: projects.isLoading,
		skippedRootsCount: skippedRoots.length,
		sorted,
	});
	const enabledColumns = new Set(readOptionalColumns(storedColumns));
	const pageRail = intakeLane === null ? PAGE_RAIL : pageRailByContentType.workflow;
	const listActions =
		projectView === 'cards' ? (
			<CardSortControl
				onToggleSort={toggleSort}
				options={projectSortOptions}
				sortDir={sortDir}
				sortKey={sortKey}
			/>
		) : (
			<ColumnChooser
				label="Columns"
				onReset={() => setStoredColumns([])}
				onToggle={(key) => {
					const next = new Set(enabledColumns);
					if (next.has(key)) next.delete(key);
					else next.add(key);
					setStoredColumns(readOptionalColumns([...next]));
				}}
				options={optionalProjectColumns}
				selected={enabledColumns}
			/>
		);

	return (
		<PageRail className="page-reveal space-y-5" rail={pageRail}>
			<PageHeader
				actions={
					<div className="flex flex-wrap items-center gap-1">
						<DataFreshness
							className="gap-1"
							label="Project list"
							onRefresh={handleRefresh}
							refreshLabel="Discover"
							sources={[{ label: 'Projects', query: projects }]}
						/>
						<ProjectsPageActions
							importOpen={intakeLane === 'ingest'}
							intakeOpen={intakeLane !== null}
							newOpen={intakeLane !== null && intakeLane !== 'ingest'}
							onToggleImport={() =>
								setIntakeLane((lane) => (lane === 'ingest' ? null : 'ingest'))
							}
							onToggleNew={() =>
								setIntakeLane((lane) =>
									lane !== null && lane !== 'ingest' ? null : 'fresh',
								)
							}
							projectView={projectView}
							setProjectView={setProjectView}
						/>
					</div>
				}
				description="Discovered `.aidd` metadata roots."
				helpSlug="projects"
				title="Projects"
			/>

			{intakeLane ? (
				<div className="scheduled-content-reveal" data-project-intake-motion="">
					<div className="scheduled-content-reveal-inner">
						<p className="mb-3 text-xs text-muted-foreground" role="status">
							Project catalog paused while intake is open. Close Project Intake to
							return to {allProjects.length} discovered project
							{allProjects.length === 1 ? '' : 's'}; the current filters and view are
							preserved.
						</p>
						<ProjectIntakePanel
							lane={intakeLane}
							onClose={() => setIntakeLane(null)}
							onLaneChange={setIntakeLane}
						/>
					</div>
				</div>
			) : null}

			{projects.isError ? (
				<ErrorState
					error={projects.error}
					message="Unknown error fetching project list."
					onRetry={handleRefresh}
					title="Could not load projects."
				/>
			) : null}

			{initFailures.length > 0 ? <ProjectInitFailures failures={initFailures} /> : null}

			{!skippedDismissed && skippedRoots.length > 0 ? (
				<SkippedRootsWarning
					onDismiss={() => setSkippedDismissed(true)}
					skippedRoots={skippedRoots}
				/>
			) : null}

			{intakeLane ? null : (
				/* Both views leave the composition on the catalog rail, so the toolbar and the
				   results below it inherit one right edge from the page rather than from a measure
				   restated here. Table view used to declare `tableColumnClass` instead, and the
				   80rem ceiling that constant carries is narrower than the content column from
				   about 1568px of viewport up: past that the table went on scrolling its optional
				   columns inside a 1280px box with the rest of the screen left empty beside it.
				   The table's own cells already size for a container wider than the resting
				   measure — that is what the `@min-[80rem]:w-auto` step in `projectTableCellClass`
				   is for — so the ceiling was the only thing keeping the room out of reach. */
				<div className="page-reveal space-y-5">
					<ProjectsToolbar
						actions={listActions}
						allProjectsCount={allProjects.length}
						hasFilters={hasFilters}
						maturityFilter={maturityFilter}
						milestoneFilter={milestoneFilter}
						milestoneOptions={milestoneOptions}
						onResetFilters={resetFilters}
						onUpdateParam={updateParam}
						phaseFilter={phaseFilter}
						query={query}
						rootFilter={rootFilter}
						rootOptions={rootOptions}
						sortedCount={sorted.length}
						syncFilter={syncFilter}
					/>

					{hiddenSpernakitCount > 0 ? (
						<p className="text-xs text-muted-foreground">
							Spernakit template checkout hidden — enable “Show Spernakit in projects
							list” in Settings to display it.
						</p>
					) : null}

					<ProjectsResults
						emptyFilters={emptyFilters}
						gitStatus={gitStatus.data?.projects}
						onRefresh={handleRefresh}
						onToggleSort={toggleSort}
						projectView={projectView}
						sortDir={sortDir}
						sortKey={sortKey}
						spernakitTemplateVersion={projects.data?.spernakitTemplateVersion ?? null}
						state={resultsState}
					/>
				</div>
			)}
		</PageRail>
	);
}
