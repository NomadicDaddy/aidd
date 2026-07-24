/* eslint-disable react-hooks/refs */
import { default as ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down';

import { DataFreshness } from '../../components/shared/DataFreshness.tsx';
import { LaunchTargetControl } from '../../components/shared/LaunchTargetControl.tsx';
import { SkeletonRows } from '../../components/shared/LoadingState.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { LiveConsolePanel } from './LiveConsolePanel.tsx';
import { PipelineConsoleSummary } from './PipelineConsoleSummary.tsx';
import { RunFilters } from './RunFilters.tsx';
import { RunLaunchCard } from './RunLaunchCard.tsx';
import {
	UnifiedExecutionTable,
	type UnifiedExecutionTableProps,
} from './UnifiedExecutionTable.tsx';
import { useRunsPage } from './useRunsPage.ts';

export function RunsPage() {
	useDocumentTitle('Runs');
	const page = useRunsPage();
	const form = page.launchForm;
	const tableProps: Omit<
		UnifiedExecutionTableProps,
		'description' | 'emptyMessage' | 'entries' | 'title'
	> = {
		continuedRunIds: page.continuedRunIds,
		continuePendingId: page.continueRun.isPending ? page.continueRun.variables : undefined,
		expandedSessions: page.expandedSessions,
		onContinue: page.submitContinue,
		onKill: (id) => page.controls.kill.mutate(id),
		onSelectPipeline: page.handleSelectPipeline,
		onSelectRun: page.handleSelectRun,
		onSelectStepRun: page.handleSelectStepRun,
		onStop: (id) => page.controls.stop.mutate(id),
		onStopSession: page.stopSession,
		onToggleSession: page.toggleSession,
		selection: page.selection,
	};

	return (
		<div className="page-reveal space-y-5">
			<PageHeader
				actions={
					<DataFreshness
						label="Run data"
						onRefresh={page.refresh}
						queries={[page.runs, page.sessionsQuery, page.projects]}
					/>
				}
				description="Launch aidd, monitor runs and recipe pipelines, and inspect live output."
				helpSlug="runs"
				title="Runs"
			/>
			<section className="space-y-2">
				<h2 className="text-foreground text-sm font-semibold">Launch Run</h2>
				<RunLaunchCard
					disabled={form.launch.isPending || !form.projectDir}
					extraArgs={form.extraArgs}
					launchTarget={form.primaryTarget}
					mode={form.mode}
					onExtraArgsChange={form.setExtraArgs}
					onLaunch={form.submitLaunch}
					onLaunchTargetChange={form.setPrimaryTarget}
					onModeChange={form.setMode}
					onProjectDirChange={(value) => {
						form.setProjectDir(value);
						if (value) form.setProjectError(false);
					}}
					projectDir={form.projectDir}
					projectError={form.projectError}
					projects={page.projectList}
					selectedLaunchProject={page.selectedLaunchProject}
				/>
			</section>
			{form.mode === 'triumvirate' && (
				<Card className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
					<LaunchTargetControl
						mode="triumvirate"
						onChange={form.setPrimaryTarget}
						projectDir={form.projectDir}
						role="primary"
						value={form.primaryTarget}
						variant="inline"
					/>
					<LaunchTargetControl
						mode="triumvirate"
						onChange={form.setSecondaryTarget}
						projectDir={form.projectDir}
						role="secondary"
						value={form.secondaryTarget}
						variant="inline"
					/>
					<LaunchTargetControl
						mode="triumvirate"
						onChange={form.setOverseerTarget}
						projectDir={form.projectDir}
						role="overseer"
						value={form.overseerTarget}
						variant="inline"
					/>
					<LaunchTargetControl
						mode="triumvirate"
						onChange={form.setExecTarget}
						projectDir={form.projectDir}
						role="exec"
						value={form.execTarget}
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
			<div className="min-w-0 space-y-5">
				<div className="min-w-0 space-y-3">
					{page.isLoading && page.loadedEntryCount === 0 ? (
						<SkeletonRows columns={4} count={6} label="Loading runs…" />
					) : (
						<>
							<UnifiedExecutionTable
								description="Runs and recipe pipelines currently executing."
								emptyMessage="Nothing is running right now."
								entries={page.activeEntries}
								title="Active"
								{...tableProps}
							/>
							<UnifiedExecutionTable
								description="Finished runs from UI launches and CLI sessions (last 24 h) and recipe pipeline history."
								emptyMessage="No runs or pipelines match the current filters."
								entries={page.historyEntries}
								title="History"
								{...tableProps}
							/>
						</>
					)}
					{page.hasMore ? (
						<div className="flex justify-center">
							<Button
								disabled={page.isFetchingMore}
								onClick={page.fetchMore}
								variant="secondary">
								<ChevronDown aria-hidden="true" className="h-4 w-4" />
								{page.isFetchingMore ? 'Loading…' : 'Show more'}
							</Button>
						</div>
					) : null}
				</div>
				<div className="min-w-0 self-start" ref={page.liveConsoleRef}>
					{page.selection?.kind === 'pipeline' && page.selectedSession ? (
						<PipelineConsoleSummary session={page.selectedSession} />
					) : (
						<LiveConsolePanel
							selectedRun={page.selectedRun}
							selectedRunId={
								page.selection?.kind === 'run' ? page.selection.id : undefined
							}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
