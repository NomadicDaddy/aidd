import { orchestratorExitCodes } from '../orchestrator/exit-codes.ts';

// Web-run outcome classification shared by the frontend (Runs page, Telemetry table) and the
// backend (Telemetry aggregation). Keyed on the minimal set of authoritative `runs` facts so a
// single rule set derives the display outcome everywhere — runs stays the source of truth and no
// derived label is ever persisted.

export type WebRunOutcomeStatus =
	'completed' | 'failed' | 'killed' | 'running' | 'stopped' | 'waiting_approval';

export type WebRunOutcomeTone = 'amber' | 'cyan' | 'emerald' | 'neutral' | 'red';

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

const statusOutcomes: Readonly<Record<WebRunOutcomeStatus, WebRunOutcome>> = {
	completed: { label: 'Completed', title: 'Run completed successfully.', tone: 'emerald' },
	failed: { label: 'Failed', title: 'Run ended in failure.', tone: 'red' },
	killed: { label: 'Killed', title: 'Run was killed.', tone: 'neutral' },
	running: { label: 'Running', title: 'Run is in progress.', tone: 'cyan' },
	stopped: { label: 'Stopped', title: 'Run was stopped on request.', tone: 'neutral' },
	waiting_approval: {
		label: 'Awaiting merge',
		title: 'Work landed in an isolated worktree but the merge-back is parked for manual resolution.',
		tone: 'amber',
	},
};

function hasCompletionMarkerWarning(summary: null | string | undefined): boolean {
	return (summary ?? '').includes('completion_marker_missing_or_unaccepted');
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

const completedWithUncommittedSource: WebRunOutcome = {
	label: 'Completed · dirty tree',
	title: 'Run completed but left uncommitted source changes in the working tree at run end; review and commit or discard them.',
	tone: 'amber',
};

// Maps a known orchestrator exit code to a human-readable outcome. The orchestrator rewrites the
// recorded exit code to one of these named values, so a bare number like 73 carries a precise
// meaning that the generic 'exit_error' stop reason hides. Returns null for unmapped codes so
// callers fall back to their generic error copy.
export function decodeExitCode(exitCode: null | number | undefined): null | WebRunOutcome {
	switch (exitCode) {
		case orchestratorExitCodes.aborted:
			return {
				label: 'Aborted',
				title: 'Run was aborted (kill/stop or hard timeout).',
				tone: 'neutral',
			};
		case orchestratorExitCodes.generalError:
			return {
				label: 'Error',
				title: 'Run ended with a general error.',
				tone: 'red',
			};
		case orchestratorExitCodes.idleTimeout:
			return {
				label: 'Idle timeout',
				title: 'Backend went idle and was stopped.',
				tone: 'amber',
			};
		case orchestratorExitCodes.missingResult:
			return {
				label: 'No result emitted',
				title: 'Backend exited without emitting AIDD_RESULT — usually a self-abort before doing work.',
				tone: 'red',
			};
		case orchestratorExitCodes.noAssistant:
			return {
				label: 'No assistant',
				title: 'Backend produced no assistant response.',
				tone: 'red',
			};
		case orchestratorExitCodes.providerError:
			return {
				label: 'Provider error',
				title: 'The model provider returned an error (network, 5xx, or parse failure).',
				tone: 'red',
			};
		case orchestratorExitCodes.rateLimited:
			return {
				label: 'Rate limited',
				title: 'Run stopped after hitting provider rate limits.',
				tone: 'amber',
			};
		case orchestratorExitCodes.validationError:
			return {
				label: 'Validation failed',
				title: 'A validation gate failed.',
				tone: 'red',
			};
		default:
			return null;
	}
}

export function classifyWebRun(run: WebRunOutcomeInput): WebRunOutcome {
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
		return statusOutcomes.waiting_approval;
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
		if (hasUncommittedSourceMarker(run.summary)) return completedWithUncommittedSource;
		return statusOutcomes.completed;
	}
	if (run.stopReason === 'no_work') {
		return { label: 'No work', title: 'No actionable work was selected.', tone: 'neutral' };
	}
	if (run.stopReason === 'stop_requested') return statusOutcomes.stopped;
	if (run.stopReason === 'killed') return statusOutcomes.killed;
	if (run.stopReason === 'max_iterations') {
		return {
			label: 'Max iterations',
			title: 'Run hit the iteration limit before finishing.',
			tone: 'amber',
		};
	}
	if (run.stopReason === 'exit_error') {
		const decoded = decodeExitCode(run.exitCode);
		if (decoded) return decoded;
		return { label: 'Error', title: 'Run ended with an error.', tone: 'red' };
	}
	if (run.status === 'completed' && (run.exitCode ?? 0) === 0) {
		if (hasUncommittedSourceMarker(run.summary)) return completedWithUncommittedSource;
		return statusOutcomes.completed;
	}
	const decoded = decodeExitCode(run.exitCode);
	if (decoded) return decoded;
	return statusOutcomes[run.status];
}

export type TelemetryOutcomeBucket =
	'completed' | 'failed' | 'killed' | 'noWork' | 'running' | 'stopped' | 'warnings';

// Converts the shared rich run outcome into one mutually-exclusive Telemetry bucket without
// collapsing deliberate stops, kills, no-work runs, or active runs into a generic failure count.
export function classifyWebRunTelemetryBucket(run: WebRunOutcomeInput): TelemetryOutcomeBucket {
	const outcome = classifyWebRun(run);
	switch (outcome.tone) {
		case 'amber':
			return 'warnings';
		case 'cyan':
			return 'running';
		case 'emerald':
			return 'completed';
		case 'neutral':
			if (run.stopReason === 'no_work') return 'noWork';
			return run.status === 'killed' ? 'killed' : 'stopped';
		case 'red':
			return 'failed';
	}
}
