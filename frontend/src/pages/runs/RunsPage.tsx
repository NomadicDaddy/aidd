/* eslint-disable react-hooks/refs */
import { default as Activity } from 'lucide-react/dist/esm/icons/activity';
// Aliased: the bare name collides with the DOM `History` interface, and TS resolves the global
// first inside JSX.
import { default as HistoryIcon } from 'lucide-react/dist/esm/icons/history';
import { useEffect, useRef, useState } from 'react';

import { DataFreshness } from '../../components/shared/DataFreshness.tsx';
import { LaunchTargetControl } from '../../components/shared/LaunchTargetControl.tsx';
import { SkeletonRows } from '../../components/shared/LoadingState.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { PageRail } from '../../components/shared/PageRail.tsx';
import { Card } from '../../components/ui/card.tsx';
import { tabButtonId, tabPanelId } from '../../components/ui/tabs.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { useViewportFill } from '../../hooks/useViewportFill.ts';
import { cn } from '../../lib/cn.ts';
import { pageRailByContentType } from '../../lib/contentRails.ts';
import { Pagination } from '../projects/detail/Pagination.tsx';
import { LiveConsolePanel } from './LiveConsolePanel.tsx';
import { MobileRunLaunchDisclosure } from './MobileRunLaunchDisclosure.tsx';
import { PipelineConsoleSummary } from './PipelineConsoleSummary.tsx';
import { RunFilters } from './RunFilters.tsx';
import { RunLaunchCard } from './RunLaunchCard.tsx';
import { RUNS_PANEL_ID, type RunsPanel, RunsPanelTabs } from './RunsPanelTabs.tsx';
import {
	UnifiedExecutionTable,
	type UnifiedExecutionTableProps,
} from './UnifiedExecutionTable.tsx';
import { HISTORY_PAGE_SIZE } from './useRunHistoryPagination.ts';
import { useRunsPage } from './useRunsPage.ts';

const PAGE_RAIL = pageRailByContentType.data;
const RUNS_VIEWPORT_GUTTER_PX = 24;
const RUNS_SPLIT_COLUMNS_CLASS =
	'grid min-w-0 gap-5 @min-[88.375rem]:grid-cols-[minmax(63.125rem,2fr)_minmax(24rem,1fr)] @min-[100rem]:grid-cols-[minmax(63.125rem,1.4fr)_minmax(24rem,1fr)]';

export function RunsPage() {
	useDocumentTitle('Runs');
	const page = useRunsPage();
	const [mobilePanel, setMobilePanel] = useState<RunsPanel>('active');
	const focusConsoleAfterActivationRef = useRef(false);
	const liveConsoleRef = page.liveConsoleRef;
	const runsViewportRef = useViewportFill<HTMLDivElement>({
		gutterPx: RUNS_VIEWPORT_GUTTER_PX,
	});
	const form = page.launchForm;
	const showingInitialSkeleton = page.isLoading && page.loadedEntryCount === 0;

	useEffect(() => {
		if (mobilePanel !== 'console' || !focusConsoleAfterActivationRef.current) return;
		focusConsoleAfterActivationRef.current = false;
		const frame = requestAnimationFrame(() => {
			const node = liveConsoleRef.current;
			if (!node) return;
			node.scrollIntoView({ behavior: 'smooth', block: 'start' });
			node.focus({ preventScroll: true });
		});
		return () => cancelAnimationFrame(frame);
	}, [liveConsoleRef, mobilePanel]);

	function selectConsoleTarget(select: () => void): void {
		select();
		if (!window.matchMedia('(max-width: 639px)').matches) return;
		focusConsoleAfterActivationRef.current = true;
		setMobilePanel('console');
	}

	const tableProps: Omit<
		UnifiedExecutionTableProps,
		'description' | 'emptyMessage' | 'entries' | 'icon' | 'showLifecycleControls' | 'title'
	> = {
		continuedRunIds: page.continuedRunIds,
		continuePendingId: page.continueRun.isPending ? page.continueRun.variables : undefined,
		expandedSessions: page.expandedSessions,
		onContinue: page.submitContinue,
		onKill: (id) => page.controls.kill.mutate(id),
		onSelectPipeline: (id) => selectConsoleTarget(() => page.handleSelectPipeline(id)),
		onSelectRun: (id) => selectConsoleTarget(() => page.handleSelectRun(id)),
		onSelectStepRun: (sessionId, runId) =>
			selectConsoleTarget(() => page.handleSelectStepRun(sessionId, runId)),
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
		<PageRail className="page-reveal @container space-y-5" rail={PAGE_RAIL}>
			<PageHeader
				actions={
					<DataFreshness
						label="Run data"
						onRefresh={page.refresh}
						sources={[
							{ label: 'Runs feed', query: page.runs },
							{ label: 'Pipeline sessions', query: page.sessionsQuery },
							{ label: 'Projects', query: page.projects },
						]}
					/>
				}
				description="Launch aidd, monitor runs and recipe pipelines, and inspect live output."
				helpSlug="runs"
				title="Runs"
			/>
			<MobileRunLaunchDisclosure>
				{/* The card owns its own header row, so its title sits inside the surface it names. */}
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
			</MobileRunLaunchDisclosure>
			<RunFilters
				displayedCount={page.displayedEntryCount}
				filteredCount={page.filteredEntryCount}
				historyProject={page.historyProject}
				initiatorFilter={page.initiatorFilter}
				kindFilter={page.kindFilter}
				modeFilter={page.modeFilter}
				onClear={page.clearFilters}
				onHistoryProjectChange={page.setHistoryProject}
				onInitiatorFilterChange={page.setInitiatorFilter}
				onKindFilterChange={page.setKindFilter}
				onModeFilterChange={page.setModeFilter}
				onQueryChange={page.setQuery}
				onStatusFilterChange={page.setStatusFilter}
				projects={page.projectList}
				query={page.query}
				statusFilter={page.statusFilter}
				totalCount={page.loadedEntryCount}
			/>
			<RunsPanelTabs
				activeCount={page.activeEntries.length}
				activePanel={mobilePanel}
				hasSelection={page.selection !== undefined}
				historyCount={page.historyEntries.length}
				onChange={setMobilePanel}
			/>
			{/* The console spans both rows. A flexible second row absorbs its overflow so Active
			    does not move when the selection changes. The split gates on its own content width:
			    the table's 63rem minimum plus its Card border, console's 24rem floor, and gap
			    require 88.375rem; below
			    that, the regions stack. Above 100rem the ratio favors long console commands.

			    This region measures one remaining-viewport budget and publishes it as
			    `--fill-height`; it does not impose it on itself. The sticky console column is the
			    only thing that needs a fixed height, so it is the only thing that resolves the
			    property. The left column stays content-led at every width, because binding it to the
			    budget made History a shorter and shorter scrollport as the window widened — 1152x1142
			    with every row on screen at 1440x900, and a fraction of that at 2250x1309. Widening a
			    window must never cost the reader rows. */}
			<div
				className={cn(
					'grid min-w-0 gap-5',
					page.selection !== undefined &&
						`${RUNS_SPLIT_COLUMNS_CLASS} @min-[88.375rem]:grid-rows-[auto_minmax(0,1fr)] @min-[88.375rem]:items-start`,
				)}
				ref={runsViewportRef}>
				<div
					aria-labelledby={tabButtonId(RUNS_PANEL_ID, 'active')}
					className={`${mobilePanel === 'active' ? 'block' : 'hidden sm:block'} order-1 min-w-0 @min-[88.375rem]:col-start-1 @min-[88.375rem]:row-start-1`}
					id={tabPanelId(RUNS_PANEL_ID, 'active')}
					role="tabpanel">
					{showingInitialSkeleton ? (
						// Two rows, not six: Active is almost always empty or holds a run or two, so a
						// six-row placeholder collapsed to "Nothing is running right now." the moment
						// the fetch landed — yanking History and the rest of the column up by five
						// rows. That collapse is the panel's largest measured layout shift.
						<SkeletonRows columns={4} count={2} label="Loading runs…" />
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
					aria-labelledby={tabButtonId(RUNS_PANEL_ID, 'console')}
					className={cn(
						mobilePanel === 'console' ? 'block' : 'hidden sm:block',
						page.selection === undefined && 'sm:hidden',
						'order-3 min-w-0 self-start @min-[88.375rem]:sticky @min-[88.375rem]:top-6 @min-[88.375rem]:col-start-2 @min-[88.375rem]:row-span-2 @min-[88.375rem]:row-start-1',
						page.selection !== undefined &&
							'@min-[88.375rem]:flex @min-[88.375rem]:h-[var(--fill-height)] @min-[88.375rem]:flex-col',
					)}
					id={tabPanelId(RUNS_PANEL_ID, 'console')}
					ref={liveConsoleRef}
					role="tabpanel"
					tabIndex={-1}>
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
				<div
					aria-labelledby={tabButtonId(RUNS_PANEL_ID, 'history')}
					className={`${mobilePanel === 'history' ? 'block' : 'hidden sm:block'} order-2 min-w-0 space-y-3 @min-[88.375rem]:col-start-1 @min-[88.375rem]:row-start-2`}
					id={tabPanelId(RUNS_PANEL_ID, 'history')}
					role="tabpanel">
					{showingInitialSkeleton ? (
						<SkeletonRows columns={4} count={6} label="Loading run history…" />
					) : (
						<UnifiedExecutionTable
							description="Finished runs from UI launches and CLI sessions (last 24 h) and recipe pipeline history."
							emptyFilters={page.emptyFilters}
							emptyMessage="No runs or pipelines match the current filters."
							entries={page.historyEntries}
							footer={
								<Pagination
									hasNextPage={page.hasMoreHistory}
									isLoadingNextPage={page.isFetchingMore}
									onChange={page.setHistoryPage}
									onLoadNextPage={() => void page.fetchNextHistoryPage()}
									page={page.historyPage}
									pageSize={HISTORY_PAGE_SIZE}
									total={page.historyTotal}
								/>
							}
							icon={
								<HistoryIcon aria-hidden="true" className="h-4 w-4 text-accent" />
							}
							// Every row here is terminal, so Stop and Kill can never enable: ten greyed
							// icons per screen that carry no information. Continue survives the flag.
							showLifecycleControls={false}
							title="History"
							{...tableProps}
						/>
					)}
				</div>
			</div>
		</PageRail>
	);
}
