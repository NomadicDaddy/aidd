import { orchestratorExitCodes } from '../orchestrator/exit-codes.ts';
import { decodeExitCode } from './outcome-exit-code.ts';

export { decodeExitCode, isProcessExitCode } from './outcome-exit-code.ts';

// Web-run outcome classification shared by the frontend (Runs page, Telemetry table) and the
// backend (Telemetry aggregation). Keyed on the minimal set of authoritative `runs` facts so a
// single rule set derives the display outcome everywhere — runs stays the source of truth and no
// derived label is ever persisted.

export type WebRunOutcomeStatus =
	'completed' | 'failed' | 'killed' | 'running' | 'stopped' | 'waiting_approval';

export type ExecutionStatus =
	'completed_with_failures' | 'queued' | 'skipped' | WebRunOutcomeStatus;

export type WebRunOutcomeTone = 'amber' | 'emerald' | 'neutral' | 'red' | 'teal';

export interface WebRunOutcome {
	label: string;
	title: string;
	tone: WebRunOutcomeTone;
}

export interface WebRunOutcomeInput {
	exitCode?: null | number;
	status: WebRunOutcomeStatus;
	stopReason?: null | string;
	summary?: null | string;
}

export const executionStatusPresentation: Readonly<Record<ExecutionStatus, WebRunOutcome>> = {
	completed: { label: 'Completed', title: 'Run completed successfully.', tone: 'emerald' },
	completed_with_failures: {
		label: 'Completed with failures',
		title: 'Execution completed, but one or more steps failed.',
		tone: 'amber',
	},
	failed: { label: 'Failed', title: 'Run ended in failure.', tone: 'red' },
	killed: { label: 'Killed', title: 'Run was killed.', tone: 'neutral' },
	queued: { label: 'Queued', title: 'Execution is waiting to start.', tone: 'teal' },
	running: { label: 'Running', title: 'Run is in progress.', tone: 'teal' },
	skipped: { label: 'Skipped', title: 'Execution was skipped.', tone: 'amber' },
	stopped: { label: 'Stopped', title: 'Run was stopped on request.', tone: 'neutral' },
	waiting_approval: {
		label: 'Awaiting approval',
		title: 'Work is parked for a human decision.',
		tone: 'amber',
	},
};

export type TelemetryOutcomeBucket =
	'completed' | 'failed' | 'flagged' | 'killed' | 'noWork' | 'running' | 'stopped' | 'warnings';

export const telemetryOutcomePresentation: Readonly<
	Record<TelemetryOutcomeBucket, Pick<WebRunOutcome, 'label' | 'tone'>>
> = {
	completed: { label: 'Completed', tone: 'emerald' },
	failed: { label: 'Failed', tone: 'red' },
	flagged: { label: 'Flagged', tone: 'red' },
	killed: { label: 'Killed', tone: 'neutral' },
	noWork: { label: 'No work', tone: 'neutral' },
	running: { label: 'Running', tone: 'teal' },
	stopped: { label: 'Stopped', tone: 'neutral' },
	warnings: { label: 'Warnings', tone: 'amber' },
};

export const telemetryOutcomeOrder: readonly TelemetryOutcomeBucket[] = [
	'completed',
	'warnings',
	'failed',
	'flagged',
	'stopped',
	'killed',
	'noWork',
	'running',
];

function hasCompletionMarkerWarning(summary: null | string | undefined): boolean {
	return (summary ?? '').includes('completion_marker');
}

// Marker the orchestrator embeds in the run summary when the wall-clock budget expired with the
// selected feature still incomplete (post-iteration.ts). Exit code 124 alone is ambiguous —
// kill/stop paths share it — so this summary marker is the only authoritative wall-clock signal.
export const wallClockTimeoutMarker = 'wall_clock_timeout:';

export function hasWallClockTimeoutMarker(summary: null | string | undefined): boolean {
	return (summary ?? '').includes(wallClockTimeoutMarker);
}

// Marker the orchestrator embeds in the run summary when the run ended with uncommitted source
// changes it introduced itself: files dirty at run end that were NOT dirty at run start,
// excluding .aidd metadata (artifacts.ts writeRunSummary). A post-commit writer (formatter,
// codegen) can dirty real source after the run's last feature commit; a completed run carrying
// this marker must not read as a clean success.
export const uncommittedSourceMarker = 'uncommitted_source_files:';

export function hasUncommittedSourceMarker(summary: null | string | undefined): boolean {
	return (summary ?? '').includes(uncommittedSourceMarker);
}

// Observational marker for source paths that became dirty during a run without any matching
// run-recorded file event or shell-command path. It remains distinct from uncommittedSourceMarker:
// concurrent operator work must stay visible without downgrading a clean run.
export const unattributedSourceMarker = 'unattributed_source_files:';

// Marker the orchestrator embeds when this run deleted a feature record that another LIVE run
// held a lease on and was mid-implementation against (artifacts.ts writeRunSummary). It rides the
// run summary rather than only a carryover note because the offender is typically a single
// -iteration directive or skill run: it finishes, there is no next prompt to correct, and without
// this the run ledgers as a clean success while the victim run fails on a missing file.
export const destroyedLeasedFeatureMarker = 'destroyed_leased_features:';

export function hasDestroyedLeasedFeatureMarker(summary: null | string | undefined): boolean {
	return (summary ?? '').includes(destroyedLeasedFeatureMarker);
}

// Marker the web heartbeat reaper appends when a hard-killed CLI left a structurally valid
// AIDD_RESULT in its final assistant message. The row remains failed/heartbeat_stale: this records
// the agent's unfinalized claim without promoting it to an accepted run result.
export const unfinalizedAgentResultMarker = 'unfinalized_agent_result:';

export function hasUnfinalizedAgentResultMarker(summary: null | string | undefined): boolean {
	return (summary ?? '').includes(unfinalizedAgentResultMarker);
}

// Marker the coding mode embeds in the run summary when it parked its selected feature instead
// of completing it — live verification was blocked, so the feature moved to waiting_approval and
// the eligible queue emptied. The run itself exits 0 with stopReason 'completed', so without this
// the row classifies as a clean success and a pipeline session made of such runs reads fully done
// while every feature it touched still needs a human.
export const parkedWorkMarker = 'parked_work:';

export function hasParkedWorkMarker(summary: null | string | undefined): boolean {
	return (summary ?? '').includes(parkedWorkMarker);
}

const completedWithParkedWork: WebRunOutcome = {
	label: 'Completed · work parked',
	title: 'The run finished cleanly but parked the feature it selected rather than completing it; the work still needs a human.',
	tone: 'amber',
};

const completedWithUncommittedSource: WebRunOutcome = {
	label: 'Completed · dirty tree',
	title: 'Run completed but left uncommitted source changes in the working tree at run end; review and commit or discard them.',
	tone: 'amber',
};

export function classifyWebRun(run: WebRunOutcomeInput): WebRunOutcome {
	if (hasUnfinalizedAgentResultMarker(run.summary)) {
		return {
			label: 'Result reported · CLI died',
			title: 'The agent reported a result, but the CLI died before aidd could finalize and verify it.',
			tone: 'amber',
		};
	}
	if (run.stopReason === 'heartbeat_stale') {
		return {
			label: 'Reaped: stale heartbeat',
			title: 'aidd reaped the Run after its heartbeat went stale and the CLI process appeared dead.',
			tone: 'red',
		};
	}
	if (run.stopReason === 'blocked') {
		if (hasCompletionMarkerWarning(run.summary)) {
			return {
				label: 'Completed (warnings)',
				title: 'Work landed but completion markers were missing or unaccepted.',
				tone: 'amber',
			};
		}
		return {
			label: 'Blocked: gate',
			title: 'A gate stopped the run before it could complete.',
			tone: 'red',
		};
	}
	if (run.stopReason === 'partial_success_blocked') {
		return {
			label: 'Partial success',
			title: 'Work landed, but the run blocked before a clean completion.',
			tone: 'amber',
		};
	}
	if (run.stopReason === 'merge_conflict_parked') {
		return {
			label: 'Awaiting merge',
			title: 'Work landed in an isolated worktree but the merge-back is parked for manual resolution.',
			tone: 'amber',
		};
	}
	// A `.aidd` metadata conflict parked the run before (or, in the rare post-merge race, after)
	// the source merge: canonical metadata was left untouched and the worktree preserved. Distinct
	// from a git merge park — there is no run branch to merge by hand, only metadata to reconcile.
	if (run.stopReason === 'metadata_conflict_parked') {
		return {
			label: 'Parked: metadata conflict',
			title: 'A .aidd metadata file the run changed also changed canonically mid-run; the metadata delta was withheld and the worktree preserved for manual reconciliation.',
			tone: 'amber',
		};
	}
	if (run.stopReason === 'blocked_dirty_worktree') {
		return {
			label: 'Blocked: dirty tree',
			title: 'Run stopped because the working tree needed cleanup before continuing.',
			tone: 'red',
		};
	}
	if (run.stopReason === 'blocked_needs_user_input') {
		return {
			label: 'Blocked: user input',
			title: 'Run stopped because it needed user input before continuing.',
			tone: 'amber',
		};
	}
	if (run.stopReason === 'completed' && (run.exitCode ?? 0) === 0) {
		if (hasParkedWorkMarker(run.summary)) return completedWithParkedWork;
		if (hasUncommittedSourceMarker(run.summary)) return completedWithUncommittedSource;
		return executionStatusPresentation.completed;
	}
	if (run.stopReason === 'no_work') {
		return { label: 'No work', title: 'No actionable work was selected.', tone: 'neutral' };
	}
	if (run.stopReason === 'stop_requested') return executionStatusPresentation.stopped;
	if (run.stopReason === 'killed') return executionStatusPresentation.killed;
	if (run.stopReason === 'max_iterations') {
		return {
			label: 'Max iterations',
			title: 'Run hit the iteration limit before finishing.',
			tone: 'amber',
		};
	}
	if (run.stopReason === 'wall_clock_budget') {
		return {
			label: 'Time budget',
			title: 'Run stopped short of its deadline: too little wall-clock budget remained to finish another iteration.',
			tone: 'amber',
		};
	}
	if (run.stopReason === 'exit_error') {
		const decoded = decodeExitCode(run.exitCode);
		if (decoded) return decoded;
		return { label: 'Error', title: 'Run ended with an error.', tone: 'red' };
	}
	if (run.status === 'completed' && (run.exitCode ?? 0) === 0) {
		if (hasParkedWorkMarker(run.summary)) return completedWithParkedWork;
		if (hasUncommittedSourceMarker(run.summary)) return completedWithUncommittedSource;
		return executionStatusPresentation.completed;
	}
	const decoded = decodeExitCode(run.exitCode);
	if (decoded) return decoded;
	return executionStatusPresentation[run.status];
}

// Converts the shared rich run outcome into one mutually-exclusive Telemetry bucket without
// collapsing deliberate stops, kills, no-work runs, or active runs into a generic failure count.
export function classifyWebRunTelemetryBucket(run: WebRunOutcomeInput): TelemetryOutcomeBucket {
	const outcome = classifyWebRun(run);
	switch (outcome.tone) {
		case 'amber':
			return 'warnings';
		case 'emerald':
			return 'completed';
		case 'neutral':
			if (run.stopReason === 'no_work') return 'noWork';
			return run.status === 'killed' ? 'killed' : 'stopped';
		case 'red':
			// Provider content-policy refusals stay red but are accounted apart from ordinary
			// failures; the exit code is the authoritative flag signal.
			return run.exitCode === orchestratorExitCodes.providerFlagged ? 'flagged' : 'failed';
		case 'teal':
			return 'running';
	}
}
