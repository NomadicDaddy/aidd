/* eslint-disable @typescript-eslint/no-misused-promises */
import { useState } from 'react';
import { toast } from 'sonner';

import { DataFreshness } from '../../components/shared/DataFreshness.tsx';
import { ErrorState } from '../../components/shared/ErrorState.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { useProjects, useProjectsGitStatus } from '../../hooks/useProjects.ts';
import { useSettingsConfig } from '../../hooks/useSettings.ts';
import { usePrefsStore } from '../../stores/prefsStore.ts';
import { ProjectInitFailures } from './ProjectInitFailures.tsx';
import { type IntakeLane, ProjectIntakePanel } from './ProjectIntakePanel.tsx';
import { ProjectsPageActions } from './ProjectsPageActions.tsx';
import { ProjectsResults } from './ProjectsResults.tsx';
import { ProjectsToolbar } from './ProjectsToolbar.tsx';
import { SkippedRootsWarning } from './SkippedRootsWarning.tsx';
import { useProjectsPageFilters } from './useProjectsFilters.ts';

export function ProjectsPage() {
	useDocumentTitle('Projects');
	const projects = useProjects();
	const gitStatus = useProjectsGitStatus();
	const projectView = usePrefsStore((state) => state.projectView);
	const setProjectView = usePrefsStore((state) => state.setProjectView);
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
	} = useProjectsPageFilters(allProjects, skippedRoots, gitStatus.data?.projects);

	async function handleRefresh() {
		setSkippedDismissed(false);
		try {
			const result = await projects.refetch();
			if (result.error) {
				toast.error('Discovery failed', {
					description:
						result.error instanceof Error
							? result.error.message
							: 'Unknown error fetching project list.',
				});
				return;
			}
			const discovered = result.data?.projects ?? [];
			if (discovered.length === 0) {
				toast.info('No projects discovered');
			} else {
				toast.success(
					`Found ${discovered.length} project${discovered.length === 1 ? '' : 's'}`,
				);
			}
		} catch (error) {
			toast.error('Discovery failed', {
				description:
					error instanceof Error ? error.message : 'Unknown error during discovery.',
			});
		}
	}

	const isError = projects.isError;
	const isLoading = projects.isLoading;
	const noRegistered =
		!isLoading && !isError && allProjects.length === 0 && skippedRoots.length > 0;
	const noDiscovered =
		!isLoading && !isError && allProjects.length === 0 && skippedRoots.length === 0;
	const noMatch = !isLoading && !isError && allProjects.length > 0 && sorted.length === 0;

	return (
		<div className="page-reveal space-y-5">
			<PageHeader
				actions={
					<div className="flex flex-wrap items-center gap-2">
						<DataFreshness
							label="Project list"
							onRefresh={handleRefresh}
							queries={[projects]}
							refreshLabel="Discover"
						/>
						<ProjectsPageActions
							importOpen={intakeLane === 'ingest'}
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
				<ProjectIntakePanel
					lane={intakeLane}
					onClose={() => setIntakeLane(null)}
					onLaneChange={setIntakeLane}
				/>
			) : null}

			{isError ? (
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

			<ProjectsToolbar
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
				<p className="text-xs text-neutral-500">
					Spernakit template checkout hidden — enable “Show Spernakit in projects list” in
					Settings to display it.
				</p>
			) : null}

			<ProjectsResults
				allProjectsCount={allProjects.length}
				gitStatus={gitStatus.data?.projects}
				isLoading={isLoading}
				noDiscovered={noDiscovered}
				noMatch={noMatch}
				noRegistered={noRegistered}
				onRefresh={handleRefresh}
				onResetFilters={resetFilters}
				onToggleSort={toggleSort}
				projectView={projectView}
				sortDir={sortDir}
				sorted={sorted}
				sortKey={sortKey}
				spernakitTemplateVersion={projects.data?.spernakitTemplateVersion ?? null}
			/>
		</div>
	);
}
