import { classifyWebRun, type WebRunOutcome } from 'aidd-shared/runs/outcome';

import type { RunRecord } from '../api/types.ts';

// Run liveness and outcome helpers read by the runs, dashboard and project-detail surfaces.

// Derive the outcome badge from the authoritative `runs` facts via the shared classifier
// (aidd-shared/runs/outcome), so the Runs page and the Telemetry dashboard render identical
// outcomes from one rule set. `stopping` overrides a running row's badge with the pending-stop
// wind-down state, a presentation concern kept out of the shared classifier so Telemetry never
// buckets a still-running row as a warning.
export function classifyRunRecord(run: RunRecord, stopping = false): WebRunOutcome {
	if (stopping && run.status === 'running') {
		return {
			label: 'Stopping…',
			title: 'Stop requested — the run finishes its current step, then stops. Kill force-terminates it immediately.',
			tone: 'amber',
		};
	}
	return classifyWebRun(run);
}

export function isTerminalStatus(status: RunRecord['status']): boolean {
	return status !== 'queued' && status !== 'running';
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

// "Active" surfaces list queued runs beside running ones, so an admitted-later launch is visible
// the moment it is accepted. Returned running-first so the executing work leads.
export function inFlightRuns(runs: readonly RunRecord[]): RunRecord[] {
	return runs.filter((run) => !isTerminalStatus(run.status)).sort(compareRunsByLiveness);
}

// Whether a launch control should hold. A QUEUED run counts: the backend has accepted it and
// will execute it, so a second Launch is a second paid run of the same work. The feature row and
// the dependency graph used to check `status === 'running'` alone, while the banner above them
// already listed queued runs as in progress - the page said a run was coming and the button
// offered another.
export function hasInFlightRun(runs: readonly RunRecord[]): boolean {
	return runs.some((run) => !isTerminalStatus(run.status));
}

// "2 running · 3 queued" when anything is queued; undefined otherwise so callers keep their copy.
export function inFlightBreakdown(runs: readonly RunRecord[]): string | undefined {
	const queued = runs.filter((run) => run.status === 'queued').length;
	if (queued === 0) return undefined;
	return `${runs.length - queued} running · ${queued} queued`;
}
