/* eslint-disable react-hooks/refs */
import { default as ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down';

import { DataFreshness } from '../../components/shared/DataFreshness.tsx';
import { LaunchTargetControl } from '../../components/shared/LaunchTargetControl.tsx';
import { SkeletonRows } from '../../components/shared/LoadingState.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { ActiveRunsTable } from './ActiveRunsTable.tsx';
import { LiveConsolePanel } from './LiveConsolePanel.tsx';
import { RunFilters } from './RunFilters.tsx';
import { RunLaunchCard } from './RunLaunchCard.tsx';
import { useRunsPage } from './useRunsPage.ts';

export function RunsPage() {
	useDocumentTitle('Runs');
	const page = useRunsPage();

	return (
		<div className="space-y-5">
			<PageHeader
				actions={
					<DataFreshness
						label="Run data"
						onRefresh={page.refresh}
						queries={[page.runs, page.projects]}
					/>
				}
				description="Launch aidd, monitor active processes, and inspect live run output."
				helpSlug="runs"
				title="Runs"
			/>
			<RunLaunchCard
				disabled={page.launch.isPending || !page.projectDir}
				extraArgs={page.extraArgs}
				launchTarget={page.primaryTarget}
				mode={page.mode}
				onExtraArgsChange={page.setExtraArgs}
				onLaunch={page.submitLaunch}
				onLaunchTargetChange={page.setPrimaryTarget}
				onModeChange={page.setMode}
				onProjectDirChange={(value) => {
					page.setProjectDir(value);
					if (value) page.setProjectError(false);
				}}
				projectDir={page.projectDir}
				projectError={page.projectError}
				projects={page.projectList}
				selectedLaunchProject={page.selectedLaunchProject}
			/>
			{page.mode === 'triumvirate' && (
				<Card className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
					<LaunchTargetControl
						mode="triumvirate"
						onChange={page.setPrimaryTarget}
						projectDir={page.projectDir}
						role="primary"
						value={page.primaryTarget}
						variant="inline"
					/>
					<LaunchTargetControl
						mode="triumvirate"
						onChange={page.setSecondaryTarget}
						projectDir={page.projectDir}
						role="secondary"
						value={page.secondaryTarget}
						variant="inline"
					/>
					<LaunchTargetControl
						mode="triumvirate"
						onChange={page.setOverseerTarget}
						projectDir={page.projectDir}
						role="overseer"
						value={page.overseerTarget}
						variant="inline"
					/>
					<LaunchTargetControl
						mode="triumvirate"
						onChange={page.setExecTarget}
						projectDir={page.projectDir}
						role="exec"
						value={page.execTarget}
						variant="inline"
					/>
				</Card>
			)}
			<RunFilters
				historyProject={page.historyProject}
				modeFilter={page.modeFilter}
				onClear={() => {
					page.setHistoryProject('all');
					page.setStatusFilter('all');
					page.setModeFilter('all');
					page.setQuery('');
				}}
				onHistoryProjectChange={page.setHistoryProject}
				onModeFilterChange={page.setModeFilter}
				onQueryChange={page.setQuery}
				onStatusFilterChange={page.setStatusFilter}
				projects={page.projectList}
				query={page.query}
				statusFilter={page.statusFilter}
			/>
			<div className="grid min-w-0 gap-4 xl:grid-cols-[1fr_1.2fr]">
				<div className="space-y-3">
					{page.runs.isLoading && page.runListLength === 0 ? (
						<SkeletonRows columns={4} count={6} label="Loading runs…" />
					) : (
						<ActiveRunsTable
							continuedRunIds={page.continuedRunIds}
							continuePendingId={
								page.continueRun.isPending ? page.continueRun.variables : undefined
							}
							onContinue={page.submitContinue}
							onKill={(id) => page.controls.kill.mutate(id)}
							onSelect={page.handleSelectRun}
							onStop={(id) => page.controls.stop.mutate(id)}
							runs={page.sortedRuns}
							selectedRunId={page.selectedRunId}
						/>
					)}
					{page.runs.hasNextPage ? (
						<div className="flex justify-center">
							<Button
								disabled={page.runs.isFetchingNextPage}
								onClick={() => void page.runs.fetchNextPage()}
								variant="secondary">
								<ChevronDown aria-hidden="true" className="h-4 w-4" />
								{page.runs.isFetchingNextPage ? 'Loading…' : 'Show more'}
							</Button>
						</div>
					) : null}
				</div>
				<div className="min-w-0 self-start" ref={page.liveConsoleRef}>
					<LiveConsolePanel
						selectedRun={page.selectedRun}
						selectedRunId={page.selectedRunId}
					/>
				</div>
			</div>
		</div>
	);
}
