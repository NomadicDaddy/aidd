import { classifyWebRun } from 'aidd-shared/runs/outcome';

import type { RunContinuationReason, RunMode, RunRecord, RunStatus } from '../../api/types.ts';
import type { OutcomeClassification } from '../../components/shared/local-aidd-history/outcome.ts';
import type { UnifiedInitiatorFilter } from './runInitiator.ts';

export type UnifiedKindFilter = 'all' | 'pipeline' | 'run' | 'skill';

export interface RunVisibilityFilters {
	historyProject: string;
	initiatorFilter: UnifiedInitiatorFilter;
	kindFilter: UnifiedKindFilter;
	modeFilter: 'all' | RunMode;
	query: string;
	statusFilter: 'all' | RunStatus;
}

// Derive the Runs-page outcome badge from the authoritative `runs` facts via the shared
// classifier (aidd-shared/runs/outcome), so the Runs page and the Telemetry dashboard render
// identical outcomes from one rule set. `stopping` overrides a running row's badge with the
// pending-stop wind-down state — a Runs-page-only presentation concern, kept out of the shared
// classifier so Telemetry never buckets a still-running row as a warning.
export function classifyRunRecord(run: RunRecord, stopping = false): OutcomeClassification {
	if (stopping && run.status === 'running') {
		return {
			label: 'Stopping…',
			title: 'Stop requested — the run finishes its current step, then stops. Kill force-terminates it immediately.',
			tone: 'amber',
		};
	}
	return classifyWebRun(run);
}

// One rule for "this running run has a pending stop": the server-derived flag (survives refresh,
// covers stops from other tabs/surfaces; `=== true` guards older backends that omit the field)
// OR-ed with this tab's locally known request for instant post-click feedback.
export function isRunStopping(run: RunRecord, locallyRequested: boolean): boolean {
	return run.status === 'running' && (run.stopRequested === true || locallyRequested);
}

export function isTerminalStatus(status: RunRecord['status']): boolean {
	return status !== 'queued' && status !== 'running';
}

// "Active" surfaces list queued runs beside running ones, so an admitted-later launch is visible
// the moment it is accepted. Returned running-first so the executing work leads.
export function inFlightRuns(runs: readonly RunRecord[]): RunRecord[] {
	return runs.filter((run) => !isTerminalStatus(run.status)).sort(compareRunsByLiveness);
}

// "2 running · 3 queued" when anything is queued; undefined otherwise so callers keep their copy.
export function inFlightBreakdown(runs: readonly RunRecord[]): string | undefined {
	const queued = runs.filter((run) => run.status === 'queued').length;
	if (queued === 0) return undefined;
	return `${runs.length - queued} running · ${queued} queued`;
}

// Why the Continue button is offered, in operator language. Shared by the desktop row and the
// mobile card so both surfaces explain the same eligibility the backend persisted.
export function continuationTitle(reason: RunContinuationReason): string {
	return reason === 'wall_clock_timeout'
		? 'This run hit its wall-clock budget with selected features incomplete. Launch a follow-up run under the same launch target.'
		: 'The initializer finished; the first coding run still needs a launch. Launch it under the same launch target.';
}

// Running runs bubble to the top so an actively executing run is always visible at the head
// of the list. Within each group (running first, then terminal) the natural startedAt-descending
// order from the backend is preserved, so once a run finishes it settles back into its proper
// chronological position without any jarring re-sort.
export function compareRunsByLiveness(a: RunRecord, b: RunRecord): number {
	const rank = (status: RunRecord['status']): number => {
		if (status === 'running') return 0;
		if (status === 'queued') return 1;
		return 2;
	};
	const byLiveness = rank(a.status) - rank(b.status);
	if (byLiveness !== 0) return byLiveness;
	return b.startedAt - a.startedAt;
}

export function normalizePathForFilter(path: string): string {
	return path.replaceAll('/', '\\').toLowerCase();
}

export function nullableText(value: string): string | undefined {
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}

export function initialSelectedRunId(searchParams: URLSearchParams): string | undefined {
	return searchParams.get('run') ?? undefined;
}

export function consumeInitialRunScroll(
	initialRunId: { current: string | undefined },
	selectedRunId: string | undefined,
	scroll: () => void,
): void {
	if (!initialRunId.current || initialRunId.current !== selectedRunId) return;
	initialRunId.current = undefined;
	scroll();
}

// Launching a run resets every activity filter to its widest value so the new run is guaranteed
// visible. Scoping the project filter to the launched run's path would also reveal it — but the
// project filter narrows Active as well as History, so launching in project B would blank out a
// run still executing in project A. Revealing the new run must never hide concurrent work: 'all'
// shows the launched run and everything running beside it.
export function filtersForLaunchedRun(): RunVisibilityFilters {
	return {
		historyProject: 'all',
		initiatorFilter: 'all',
		kindFilter: 'all',
		modeFilter: 'all',
		query: '',
		statusFilter: 'all',
	};
}
