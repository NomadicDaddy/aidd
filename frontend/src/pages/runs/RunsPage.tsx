/* eslint-disable react-hooks/refs */
import { default as Activity } from 'lucide-react/dist/esm/icons/activity';
import { default as ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down';
// Aliased: the bare name collides with the DOM `History` interface, and TS resolves the global
// first inside JSX.
import { default as HistoryIcon } from 'lucide-react/dist/esm/icons/history';

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
	const showingInitialSkeleton = page.isLoading && page.loadedEntryCount === 0;
	const tableProps: Omit<
		UnifiedExecutionTableProps,
		'description' | 'emptyMessage' | 'entries' | 'icon' | 'showLifecycleControls' | 'title'
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
		projectRouteIdByPath: page.projectRouteIdByPath,
		selection: page.selection,
	};

	return (
		// `@container` on the page root, so every region below gates on the width of the content
		// column rather than the window. The two differ by the whole sidebar rail, and the rail's
		// expanded/collapsed state is persisted per user — a viewport tier decides the same layout
		// two different ways for two users at the same window size.
		<div className="page-reveal @container space-y-5">
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
			{/* No <section>/<h2> wrapper: the card owns its own header row, so the title sits inside
			    the surface it names instead of floating on the page background above it. */}
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
			{form.mode === 'triumvirate' && (
				<Card className="grid gap-3 @min-[32rem]:grid-cols-2 @min-[61rem]:grid-cols-4">
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
				filteredCount={page.filteredEntryCount}
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
				totalCount={page.loadedEntryCount}
			/>
			{/* The console column spans both rows, so without an explicit flexible second row a
			    console taller than Active+gap+History has its excess split evenly across both rows —
			    shifting Active's bottom edge and the History card down by half the overflow every
			    time the selection (or a streaming run's output) changes height. `auto 1fr` sends the
			    whole excess to row 2 instead, so the left column never moves.

			    The split gates on this region's own width, not the viewport. It was `2xl:` — 1536px
			    of window — which denied the split at 1440 even with the rail collapsed, where the
			    column is over 1300px and had room for it twice over. 66rem is the width where the
			    arithmetic works: the console's own `minmax(24rem,…)` floor takes 384px, the 1.25rem
			    gap takes 20px, and the table keeps the ~650px it needs to stay readable. Below it
			    the two stack, which is the correct answer for a 1024px column however wide the
			    window behind it happens to be.

			    Above 100rem the ratio inverts toward the console, because the two columns hold
			    opposite kinds of content. The table's widest cell is a badge group and a duration;
			    the console's is a 200-character launch command. At `2fr` in a 1962px column the
			    table took 1295px and the transcript 647px, and `git status --porcelain=v2` wrapped
			    as `--porcel` / `ain=v2` — a broken flag beside a table with slack in every column.
			    `1.4fr` puts that at ~1133/809. It is a second step rather than a flat swap because
			    the table carries `min-w-[56rem]` and scrolls under it: below a 1600px column, 2fr
			    is what keeps the table above its own floor. */}
			<div className="grid min-w-0 gap-5 @min-[66rem]:grid-cols-[minmax(0,2fr)_minmax(24rem,1fr)] @min-[66rem]:grid-rows-[auto_1fr] @min-[66rem]:items-start @min-[100rem]:grid-cols-[minmax(0,1.4fr)_minmax(24rem,1fr)]">
				<div className="min-w-0 @min-[66rem]:col-start-1 @min-[66rem]:row-start-1">
					{showingInitialSkeleton ? (
						<SkeletonRows columns={4} count={6} label="Loading runs…" />
					) : (
						<UnifiedExecutionTable
							description="Runs and recipe pipelines currently executing."
							emptyMessage="Nothing is running right now."
							entries={page.activeEntries}
							icon={<Activity aria-hidden="true" className="h-4 w-4 text-accent" />}
							title="Active"
							{...tableProps}
						/>
					)}
				</div>
				<div
					className="min-w-0 self-start @min-[66rem]:sticky @min-[66rem]:top-6 @min-[66rem]:col-start-2 @min-[66rem]:row-span-2 @min-[66rem]:row-start-1 @min-[66rem]:flex @min-[66rem]:h-[calc(100dvh-3rem)] @min-[66rem]:flex-col"
					ref={page.liveConsoleRef}>
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
				{showingInitialSkeleton ? null : (
					<div className="min-w-0 space-y-3 @min-[66rem]:col-start-1 @min-[66rem]:row-start-2">
						<UnifiedExecutionTable
							description="Finished runs from UI launches and CLI sessions (last 24 h) and recipe pipeline history."
							emptyMessage="No runs or pipelines match the current filters."
							entries={page.historyEntries}
							footer={
								page.hasMore ? (
									<Button
										disabled={page.isFetchingMore}
										onClick={page.fetchMore}
										variant="secondary">
										<ChevronDown aria-hidden="true" className="h-4 w-4" />
										{page.isFetchingMore ? 'Loading…' : 'Show more'}
									</Button>
								) : null
							}
							icon={
								<HistoryIcon aria-hidden="true" className="h-4 w-4 text-accent" />
							}
							// History is the unbounded table: capped in its own scrollport with a
							// pinned header, so the columns are still named at row 40.
							scrollBody
							// Every row here is terminal, so Stop and Kill can never enable: ten greyed
							// icons per screen that carry no information. Continue survives the flag.
							showLifecycleControls={false}
							title="History"
							{...tableProps}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
