import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import type { RunMode, RunRecord } from '../../api/types.ts';

import { usePipelineSessions } from '../../hooks/usePipelineSessions.ts';
import { useProjects } from '../../hooks/useProjects.ts';
import { useContinueRun, useRunControls, useRunRecord, useRuns } from '../../hooks/useRuns.ts';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';
import { consumeInitialRunScroll, filtersForLaunchedRun } from './runsUtils.ts';
import {
	buildUnifiedEntries,
	entryMatchesFilters,
	entryStartedAt,
	historyDisplayFloor,
	initialSelection,
	needsRunRecordFallback,
	oldestStartedAt,
	splitEntriesByLiveness,
	type UnifiedSelection,
	type UnifiedStatusFilter,
} from './unifiedEntries.ts';
import { useRunLaunchForm } from './useRunLaunchForm.ts';

// Auto-expanded active sessions on first load; a bound so many simultaneously active
// sessions don't each start a 3s report poll.
const MAX_AUTO_EXPANDED_SESSIONS = 3;

export function useRunsPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const queryClient = useQueryClient();
	const projects = useProjects();
	// Top-level only: pipeline-owned runs surface inside their session's step rows.
	const runs = useRuns(undefined, { topLevel: true });
	const pipelineSessions = usePipelineSessions();
	const continueRun = useContinueRun();
	const controls = useRunControls();
	const [selection, setSelection] = useState<undefined | UnifiedSelection>(
		initialSelection(searchParams)
	);
	const [expandedSessions, setExpandedSessions] = useState<ReadonlySet<string>>(new Set());
	// The session a step-selected run belongs to. Kept in the URL (?run=…&pipeline=…) so a
	// refresh after clicking a step's console restores the expanded-session context.
	const [pipelineContextId, setPipelineContextId] = useState<string | undefined>(
		searchParams.get('pipeline') ?? undefined
	);
	const liveConsoleRef = useRef<HTMLDivElement>(null);
	const initialSelectionIdRef = useRef(initialSelection(searchParams)?.id);
	// State (not a ref) because it guards a render-phase adjustment below, where ref
	// access is disallowed.
	const [seededExpansion, setSeededExpansion] = useState(false);
	const [historyProject, setHistoryProject] = useState(searchParams.get('project') ?? 'all');
	const [statusFilter, setStatusFilter] = useState<UnifiedStatusFilter>('all');
	const [modeFilter, setModeFilter] = useState<'all' | RunMode>('all');
	const [query, setQuery] = useState('');

	function scrollConsoleIntoView(): void {
		const node = liveConsoleRef.current;
		if (!node) return;
		// Measure after React commits the selected entry's output, otherwise getBoundingClientRect
		// reads stale layout from before the re-render. The ref is on the console card wrapper
		// (self-start so it sizes to the card, not the full grid row), so we scroll the console
		// itself into view rather than the top of the run list.
		requestAnimationFrame(() => {
			const rect = node.getBoundingClientRect();
			const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
			// Scroll only when the console's top edge is off-screen — avoids needless scrolling
			// when the card is taller than the viewport but its header is already visible.
			const offscreen = rect.top < 0 || rect.top > viewportHeight;
			if (offscreen) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
		});
	}
	function handleSelectRun(id: string): void {
		setSelection({ id, kind: 'run' });
		setPipelineContextId(undefined);
		scrollConsoleIntoView();
	}
	function handleSelectPipeline(id: string): void {
		setSelection({ id, kind: 'pipeline' });
		setPipelineContextId(id);
		setExpandedSessions((previous) => new Set([...previous, id]));
		scrollConsoleIntoView();
	}
	// A step's Console click selects the step's run while keeping its session as context.
	function handleSelectStepRun(sessionId: string, runId: string): void {
		setSelection({ id: runId, kind: 'run' });
		setPipelineContextId(sessionId);
		scrollConsoleIntoView();
	}
	function toggleSession(id: string): void {
		setExpandedSessions((previous) => {
			const next = new Set(previous);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}
	function onLaunched(run: RunRecord): void {
		const visibilityFilters = filtersForLaunchedRun(run);
		setHistoryProject(visibilityFilters.historyProject);
		setStatusFilter(visibilityFilters.statusFilter);
		setModeFilter(visibilityFilters.modeFilter);
		setQuery(visibilityFilters.query);
		setSelection({ id: run.id, kind: 'run' });
	}
	const launchForm = useRunLaunchForm(onLaunched);

	const projectList = projects.data?.projects ?? [];
	const runList = runs.data?.pages.flatMap((page) => page.runs) ?? [];
	const sessionList =
		pipelineSessions.sessions.data?.pages.flatMap((page) => page.sessions) ?? [];
	// Runs that already have a follow-up (any loaded run pointing back at them) hide their
	// Continue button; the server independently rejects a duplicate continue with a 409.
	const continuedRunIds = new Set<string>();
	for (const run of runList) {
		if (run.chainedFromRunId) continuedRunIds.add(run.chainedFromRunId);
	}
	const listedRun =
		selection?.kind === 'run' ? runList.find((run) => run.id === selection.id) : undefined;
	// Fallback single-record fetch: a pipeline-owned run deep-linked via ?run= is not in the
	// topLevel list, but its console must still open.
	const fallbackRun = useRunRecord(
		selection?.kind === 'run' ? selection.id : undefined,
		needsRunRecordFallback(selection, runList)
	);
	const selectedRun = listedRun ?? fallbackRun.data ?? undefined;
	const selectedSession =
		selection?.kind === 'pipeline'
			? sessionList.find((session) => session.id === selection.id)
			: undefined;
	const selectedLaunchProject = projectList.find(
		(project) => project.path === launchForm.projectDir
	);

	const filters = { mode: modeFilter, project: historyProject, query, status: statusFilter };
	const filteredEntries = buildUnifiedEntries(runList, sessionList).filter((entry) =>
		entryMatchesFilters(entry, filters)
	);
	const { active: activeEntries, history } = splitEntriesByLiveness(filteredEntries);
	// Clamp History to the faithfully-merged window (see historyDisplayFloor): the denser
	// source's unloaded range must not read as "nothing happened" while the sparser source
	// still shows entries there. Active is exempt — live entries are shown wherever loaded.
	const historyFloor = historyDisplayFloor([
		{ hasMore: runs.hasNextPage === true, oldestLoaded: oldestStartedAt(runList) },
		{
			hasMore: pipelineSessions.sessions.hasNextPage === true,
			oldestLoaded: oldestStartedAt(sessionList),
		},
	]);
	const historyEntries = history.filter((entry) => entryStartedAt(entry) >= historyFloor);

	// Auto-expand active sessions once when they first load (bounded), plus a ?pipeline=
	// deep link (whether it arrived as the selection or as a step-run's session context).
	// Render-phase adjustment (react.dev's "adjusting state when props change" pattern) —
	// an effect would trigger a cascading re-render.
	if (!seededExpansion && sessionList.length > 0) {
		setSeededExpansion(true);
		const ids = sessionList
			.filter(
				(session) =>
					session.totalSteps > 1 &&
					(session.status === 'queued' || session.status === 'running')
			)
			.slice(0, MAX_AUTO_EXPANDED_SESSIONS)
			.map((session) => session.id);
		if (pipelineContextId !== undefined) ids.push(pipelineContextId);
		if (ids.length > 0) setExpandedSessions(new Set(ids));
	}

	// Scroll the deep-linked entry's console into view once, only when the page opened with a
	// ?run=/?pipeline= param. Guarding on the ref being set (not just id equality) keeps a plain
	// /runs visit — where both sides are undefined — from scrolling on every polling refetch.
	const resolvedSelectionId =
		selection?.kind === 'pipeline' ? selectedSession?.id : selectedRun?.id;
	useEffect(() => {
		consumeInitialRunScroll(initialSelectionIdRef, resolvedSelectionId, () => {
			liveConsoleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		});
	}, [resolvedSelectionId]);

	useEffect(() => {
		const next = new URLSearchParams();
		if (historyProject !== 'all') next.set('project', historyProject);
		if (selection?.kind === 'run') next.set('run', selection.id);
		if (pipelineContextId !== undefined) next.set('pipeline', pipelineContextId);
		setSearchParams(next, { replace: true });
	}, [historyProject, pipelineContextId, selection, setSearchParams]);

	function submitContinue(id: string): void {
		traceDataMovement({
			category: 'event',
			layer: 'ui',
			operation: 'runs.continue',
			source: 'RunsPage',
			summary: { runId: id },
			target: '/api/v1/runs/:id/continue',
		});
		continueRun.mutate(id, {
			onError(error) {
				toast.error(error instanceof Error ? error.message : 'Follow-up run launch failed');
			},
			onSuccess(run) {
				onLaunched(run);
				toast.success('Follow-up run launched');
			},
		});
	}

	function stopSession(id: string): void {
		traceDataMovement({
			category: 'event',
			layer: 'ui',
			operation: 'pipeline.stop',
			source: 'RunsPage',
			summary: { sessionId: id },
			target: '/api/v1/pipeline-sessions/:id/stop',
		});
		pipelineSessions.stopSession.mutate(id, {
			onSuccess: () => toast.success('Session stopped'),
		});
	}

	function refresh(): void {
		traceDataMovement({
			category: 'event',
			layer: 'ui',
			operation: 'runs.refresh',
			source: 'RunsPage',
			summary: { queries: ['runs', 'pipeline-sessions', 'projects'] },
		});
		void Promise.all([
			queryClient.refetchQueries({ queryKey: ['runs'] }),
			queryClient.refetchQueries({ queryKey: ['pipeline-sessions'] }),
			queryClient.refetchQueries({ queryKey: ['projects'] }),
		]);
	}

	// One shared "Show more" advances both startedAt-descending lists together; the
	// historyDisplayFloor clamp above then extends the visible window only as far as both
	// sources have actually loaded, so each click reveals a complete slice of the timeline.
	const hasMore = runs.hasNextPage === true || pipelineSessions.sessions.hasNextPage === true;
	const isFetchingMore = runs.isFetchingNextPage || pipelineSessions.sessions.isFetchingNextPage;
	function fetchMore(): void {
		if (runs.hasNextPage) void runs.fetchNextPage();
		if (pipelineSessions.sessions.hasNextPage) void pipelineSessions.sessions.fetchNextPage();
	}

	return {
		activeEntries,
		continuedRunIds,
		continueRun,
		controls,
		expandedSessions,
		fetchMore,
		handleSelectPipeline,
		handleSelectRun,
		handleSelectStepRun,
		hasMore,
		historyEntries,
		historyProject,
		isFetchingMore,
		isLoading: runs.isLoading || pipelineSessions.sessions.isLoading,
		launchForm,
		liveConsoleRef,
		loadedEntryCount: runList.length + sessionList.length,
		modeFilter,
		projectList,
		projects,
		query,
		refresh,
		runs,
		selectedLaunchProject,
		selectedRun,
		selectedSession,
		selection,
		sessionsQuery: pipelineSessions.sessions,
		setHistoryProject,
		setModeFilter,
		setQuery,
		setStatusFilter,
		statusFilter,
		stopSession,
		submitContinue,
		toggleSession,
	};
}
