/* eslint-disable react-hooks/refs */
import { default as Activity } from 'lucide-react/dist/esm/icons/activity';
import { default as ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down';
// Aliased: the bare name collides with the DOM `History` interface, and TS resolves the global
// first inside JSX.
import { default as HistoryIcon } from 'lucide-react/dist/esm/icons/history';
import { useEffect, useRef, useState } from 'react';

import { DataFreshness } from '../../components/shared/DataFreshness.tsx';
import { LaunchTargetControl } from '../../components/shared/LaunchTargetControl.tsx';
import { SkeletonRows } from '../../components/shared/LoadingState.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { tabButtonId, tabPanelId } from '../../components/ui/tabs.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { LiveConsolePanel } from './LiveConsolePanel.tsx';
import { PipelineConsoleSummary } from './PipelineConsoleSummary.tsx';
import { RunFilters } from './RunFilters.tsx';
import { RunLaunchCard } from './RunLaunchCard.tsx';
import { RUNS_PANEL_ID, type RunsPanel, RunsPanelTabs } from './RunsPanelTabs.tsx';
import {
	UnifiedExecutionTable,
	type UnifiedExecutionTableProps,
} from './UnifiedExecutionTable.tsx';
import { useRunsPage } from './useRunsPage.ts';

export function RunsPage() {
	useDocumentTitle('Runs');
	const page = useRunsPage();
	const [mobilePanel, setMobilePanel] = useState<RunsPanel>('active');
	const focusConsoleAfterActivationRef = useRef(false);
	const liveConsoleRef = page.liveConsoleRef;
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
				kindFilter={page.kindFilter}
				modeFilter={page.modeFilter}
				onClear={() => {
					page.setHistoryProject('all');
					page.setStatusFilter('all');
					page.setKindFilter('all');
					page.setModeFilter('all');
					page.setQuery('');
				}}
				onHistoryProjectChange={page.setHistoryProject}
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
			{/* The console column spans both rows, so without an explicit flexible second row a
			    console taller than Active+gap+History has its excess split evenly across both rows —
			    shifting Active's bottom edge and the History card down by half the overflow every
			    time the selection (or a streaming run's output) changes height. `auto 1fr` sends the
			    whole excess to row 2 instead, so the left column never moves.

			    The split gates on this region's own width, not the viewport. The table's 56rem
			    minimum, the console's 24rem floor, and the 1.25rem gap total 81.25rem. Below that
			    measured content width the three regions stack, so History never opens with Duration
			    and Actions hidden behind its horizontal scrollport.

			    Above 100rem the ratio inverts toward the console, because the two columns hold
			    opposite kinds of content. The table's widest cell is a badge group and a duration;
			    the console's is a 200-character launch command. At `2fr` in a 1962px column the
			    table took 1295px and the transcript 647px, and `git status --porcelain=v2` wrapped
			    as `--porcel` / `ain=v2` — a broken flag beside a table with slack in every column.
			    `1.4fr` puts that at ~1133/809. It is a second step rather than a flat swap because
			    the table carries `min-w-[56rem]` and scrolls under it: below a 1600px column, 2fr
			    is what keeps the table above its own floor. */}
			<div className="grid min-w-0 gap-5 @min-[81.25rem]:grid-cols-[minmax(0,2fr)_minmax(24rem,1fr)] @min-[81.25rem]:grid-rows-[auto_1fr] @min-[81.25rem]:items-start @min-[100rem]:grid-cols-[minmax(0,1.4fr)_minmax(24rem,1fr)]">
				<div
					aria-labelledby={tabButtonId(RUNS_PANEL_ID, 'active')}
					className={`${mobilePanel === 'active' ? 'block' : 'hidden sm:block'} min-w-0 @min-[81.25rem]:col-start-1 @min-[81.25rem]:row-start-1`}
					id={tabPanelId(RUNS_PANEL_ID, 'active')}
					role="tabpanel">
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
					aria-labelledby={tabButtonId(RUNS_PANEL_ID, 'console')}
					className={`${mobilePanel === 'console' ? 'block' : 'hidden sm:block'} min-w-0 self-start @min-[81.25rem]:sticky @min-[81.25rem]:top-6 @min-[81.25rem]:col-start-2 @min-[81.25rem]:row-span-2 @min-[81.25rem]:row-start-1 @min-[81.25rem]:flex @min-[81.25rem]:h-[calc(100dvh-3rem)] @min-[81.25rem]:flex-col`}
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
					className={`${mobilePanel === 'history' ? 'block' : 'hidden sm:block'} min-w-0 space-y-3 @min-[81.25rem]:col-start-1 @min-[81.25rem]:row-start-2`}
					id={tabPanelId(RUNS_PANEL_ID, 'history')}
					role="tabpanel">
					{showingInitialSkeleton ? (
						<SkeletonRows columns={4} count={6} label="Loading run history…" />
					) : (
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
					)}
				</div>
			</div>
		</div>
	);
}
