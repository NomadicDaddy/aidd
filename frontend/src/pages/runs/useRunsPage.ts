import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import type { RunLaunchRequest, RunMode, RunStatus } from '../../api/types.ts';
import type { LaunchTargetValue } from '../../api/types/launchDefaults.ts';

import { useProjects } from '../../hooks/useProjects.ts';
import { useContinueRun, useLaunchRun, useRunControls, useRuns } from '../../hooks/useRuns.ts';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';
import {
	compareRunsByLiveness,
	consumeInitialRunScroll,
	filtersForLaunchedRun,
	initialSelectedRunId,
	normalizePathForFilter,
	nullableText,
} from './runsUtils.ts';

export function useRunsPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const queryClient = useQueryClient();
	const projects = useProjects();
	const runs = useRuns();
	const launch = useLaunchRun();
	const continueRun = useContinueRun();
	const controls = useRunControls();
	const [selectedRunId, setSelectedRunId] = useState<string | undefined>(
		initialSelectedRunId(searchParams)
	);
	const liveConsoleRef = useRef<HTMLDivElement>(null);
	const initialRunIdRef = useRef(initialSelectedRunId(searchParams));
	function handleSelectRun(id: string): void {
		setSelectedRunId(id);
		const node = liveConsoleRef.current;
		if (!node) return;
		// Measure after React commits the selected run's output, otherwise getBoundingClientRect
		// reads stale layout from before the re-render. The ref is on the console card wrapper
		// (self-start so it sizes to the card, not the full grid row), so we scroll the console
		// itself into view rather than the top of the run list.
		requestAnimationFrame(() => {
			const rect = node.getBoundingClientRect();
			const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
			// Scroll only when the console's top edge is off-screen. Using the top (not the
			// bottom) avoids needless scrolling when the card is taller than the viewport but
			// its header is already visible.
			const offscreen = rect.top < 0 || rect.top > viewportHeight;
			if (offscreen) {
				node.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}
		});
	}
	const [historyProject, setHistoryProject] = useState(searchParams.get('project') ?? 'all');
	const [projectDir, setProjectDir] = useState('');
	const [projectError, setProjectError] = useState(false);
	const [statusFilter, setStatusFilter] = useState<'all' | RunStatus>('all');
	const [modeFilter, setModeFilter] = useState<'all' | RunMode>('all');
	const [mode, setMode] = useState<RunMode>('coding');
	// Overrides-only launch targets: an empty object means "use the resolved defaults",
	// which LaunchTargetControl displays live from /api/v1/launch-defaults rather than
	// copying settings values into editable fields.
	const [primaryTarget, setPrimaryTarget] = useState<LaunchTargetValue>({});
	const [secondaryTarget, setSecondaryTarget] = useState<LaunchTargetValue>({});
	const [overseerTarget, setOverseerTarget] = useState<LaunchTargetValue>({});
	const [execTarget, setExecTarget] = useState<LaunchTargetValue>({});
	const [extraArgs, setExtraArgs] = useState('');
	const [query, setQuery] = useState('');
	const projectList = projects.data?.projects ?? [];
	const runList = runs.data?.pages.flatMap((page) => page.runs) ?? [];
	// Runs that already have a follow-up (any loaded run pointing back at them) hide their
	// Continue button; the server independently rejects a duplicate continue with a 409.
	const continuedRunIds = new Set<string>();
	for (const run of runList) {
		if (run.chainedFromRunId) continuedRunIds.add(run.chainedFromRunId);
	}
	const selectedRun = runList.find((run) => run.id === selectedRunId);
	const selectedLaunchProject = projectList.find((project) => project.path === projectDir);
	const filteredRuns = runList.filter((run) => {
		if (
			historyProject !== 'all' &&
			normalizePathForFilter(run.projectPath) !== normalizePathForFilter(historyProject)
		) {
			return false;
		}
		if (statusFilter !== 'all' && run.status !== statusFilter) return false;
		if (modeFilter !== 'all' && run.mode !== modeFilter) return false;
		const haystack = `${run.id} ${run.projectName} ${run.projectPath} ${run.mode} ${run.status} ${run.source}`;
		return haystack.toLowerCase().includes(query.toLowerCase());
	});
	// Bubble running runs to the top so an actively executing run is always at the head of the
	// table. Within each liveness group the backend's startedAt-descending order is preserved, so
	// when a run finishes it settles back into its proper chronological position.
	const sortedRuns = filteredRuns.slice().sort(compareRunsByLiveness);

	// Scroll the deep-linked run's console into view once, only when the page opened with a
	// ?run= param. Guarding on the ref being set (not just matching selectedRun?.id) is what
	// keeps a plain /runs visit — where both sides are undefined — from scrolling on every
	// 15-second polling refetch.
	useEffect(() => {
		consumeInitialRunScroll(initialRunIdRef, selectedRun?.id, () => {
			liveConsoleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		});
	}, [selectedRun]);

	useEffect(() => {
		const next = new URLSearchParams();
		if (historyProject !== 'all') next.set('project', historyProject);
		if (selectedRunId) next.set('run', selectedRunId);
		setSearchParams(next, { replace: true });
	}, [historyProject, selectedRunId, setSearchParams]);

	function submitLaunch(): void {
		if (!projectDir) {
			setProjectError(true);
			toast.error('Select a project before launching');
			return;
		}
		const request: RunLaunchRequest = { mode, projectDir };
		const launchExtraArgs = nullableText(extraArgs);
		if (launchExtraArgs) request.extraArgs = launchExtraArgs;
		// Only explicit overrides travel on the request; unset fields resolve on the
		// server (project config, then global config) — matching what the chip displays.
		if (primaryTarget.backend) request.backend = primaryTarget.backend;
		const primaryModel = nullableText(primaryTarget.model ?? '');
		if (primaryModel) request.model = primaryModel;
		const primaryEffort = nullableText(primaryTarget.reasoningEffort ?? '');
		if (primaryEffort) request.reasoningEffort = primaryEffort;
		if (mode === 'triumvirate') {
			if (secondaryTarget.backend) request.secondaryBackend = secondaryTarget.backend;
			if (overseerTarget.backend) request.overseerBackend = overseerTarget.backend;
			if (execTarget.backend) request.execBackend = execTarget.backend;
			const nextSecondaryModel = nullableText(secondaryTarget.model ?? '');
			const nextOverseerModel = nullableText(overseerTarget.model ?? '');
			const nextExecModel = nullableText(execTarget.model ?? '');
			if (nextSecondaryModel) request.secondaryModel = nextSecondaryModel;
			if (nextOverseerModel) request.overseerModel = nextOverseerModel;
			if (nextExecModel) request.execModel = nextExecModel;
		}
		traceDataMovement({
			category: 'event',
			layer: 'ui',
			operation: 'runs.launch.submit',
			source: 'RunsPage',
			summary: {
				hasExtraArgs: Boolean(launchExtraArgs),
				mode,
				projectSelected: projectDir.length > 0,
			},
			target: '/api/v1/runs',
		});
		launch.mutate(request, {
			onError(error) {
				toast.error(error instanceof Error ? error.message : 'Run launch failed');
			},
			onSuccess(run) {
				const visibilityFilters = filtersForLaunchedRun(run);
				setHistoryProject(visibilityFilters.historyProject);
				setStatusFilter(visibilityFilters.statusFilter);
				setModeFilter(visibilityFilters.modeFilter);
				setQuery(visibilityFilters.query);
				setSelectedRunId(run.id);
				toast.success('Run launched');
			},
		});
	}

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
				const visibilityFilters = filtersForLaunchedRun(run);
				setHistoryProject(visibilityFilters.historyProject);
				setStatusFilter(visibilityFilters.statusFilter);
				setModeFilter(visibilityFilters.modeFilter);
				setQuery(visibilityFilters.query);
				setSelectedRunId(run.id);
				toast.success('Follow-up run launched');
			},
		});
	}

	function refresh(): void {
		traceDataMovement({
			category: 'event',
			layer: 'ui',
			operation: 'runs.refresh',
			source: 'RunsPage',
			summary: { queries: ['runs', 'projects'] },
		});
		void Promise.all([
			queryClient.refetchQueries({ queryKey: ['runs'] }),
			queryClient.refetchQueries({ queryKey: ['projects'] }),
		]);
	}

	return {
		continuedRunIds,
		continueRun,
		controls,
		execTarget,
		extraArgs,
		handleSelectRun,
		historyProject,
		launch,
		liveConsoleRef,
		mode,
		modeFilter,
		overseerTarget,
		primaryTarget,
		projectDir,
		projectError,
		projectList,
		projects,
		query,
		refresh,
		runListLength: runList.length,
		runs,
		secondaryTarget,
		selectedLaunchProject,
		selectedRun,
		selectedRunId,
		setExecTarget,
		setExtraArgs,
		setHistoryProject,
		setMode,
		setModeFilter,
		setOverseerTarget,
		setPrimaryTarget,
		setProjectDir,
		setProjectError,
		setQuery,
		setSecondaryTarget,
		setStatusFilter,
		sortedRuns,
		statusFilter,
		submitContinue,
		submitLaunch,
	};
}
