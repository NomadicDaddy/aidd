import { orchestratorExitCodes } from 'aidd-shared/orchestrator/exit-codes';

import type {
	FinalCheckSummary,
	ProjectLocalIteration,
	ProjectLocalRun,
} from '../../../api/types.ts';

const finalCheckLabels: Readonly<Record<string, string>> = {
	build: 'build',
	format: 'format',
	smokeQc: 'smoke:qc',
	typecheck: 'typecheck',
};

export function finalCheckLabel(name: string): string {
	return finalCheckLabels[name] ?? name;
}

// Names of final acceptance checks an iteration recorded as failed. These are tracked even when
// the iteration exited 0, so a failed gate (e.g. smoke:qc) can be surfaced rather than buried
// behind a clean "Success".
export function iterationFinalCheckFailures(finalChecks: FinalCheckSummary | null): string[] {
	if (!finalChecks) return [];
	return Object.entries(finalChecks)
		.filter(([, status]) => status === 'failed')
		.map(([name]) => name);
}

export type OutcomeTone = 'amber' | 'emerald' | 'neutral' | 'red' | 'teal';

export interface OutcomeClassification {
	label: string;
	title: string;
	tone: OutcomeTone;
}

const failingIterationStatuses = new Set([
	'aborted',
	'active_verification_timeout',
	'failure',
	'idle_timeout',
	'no_assistant',
	'provider_error',
	'provider_flagged',
	'rate_limited',
	'validation_error',
]);

const iterationStatusLabels: Readonly<Record<string, string>> = {
	aborted: 'Aborted',
	active_verification_recovery: 'Verification recovered',
	active_verification_timeout: 'Verification timeout',
	failure: 'Failure',
	idle_timeout: 'Idle timeout',
	no_assistant: 'No assistant response',
	provider_error: 'Provider error',
	provider_flagged: 'Provider flagged',
	rate_limited: 'Rate limited',
	running: 'Running',
	success: 'Success',
	validation_error: 'Validation error',
	verification_lifecycle_conflict: 'Verification lifecycle conflict',
};

function humanizeStatus(status: string): string {
	const known = iterationStatusLabels[status];
	if (known) return known;
	if (!status) return 'Unknown';
	const spaced = status.replaceAll('_', ' ').trim();
	if (!spaced) return 'Unknown';
	return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

// Maps a known orchestrator exit code to a human-readable outcome. The orchestrator
// rewrites the recorded exit code to one of these named values (see
// orchestratorExitCodes), so a bare number like 73 carries a precise meaning that the
// generic 'exit_error' stop reason hides. Returns null for unmapped codes so callers
// fall back to their generic error copy.
export function decodeExitCode(exitCode: null | number | undefined): null | OutcomeClassification {
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
		case orchestratorExitCodes.providerFlagged:
			return {
				label: 'Provider flagged',
				title: 'The model provider refused the request on content-policy grounds (the response was flagged).',
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

export function classifyRun(run: ProjectLocalRun): OutcomeClassification {
	const reason = run.stopReason ?? 'unknown';
	if (run.scopeOverrun) {
		return {
			label: 'Scope overrun',
			title: 'Completed feature(s) outside the selected scope; review what landed before accepting.',
			tone: 'red',
		};
	}
	// Roadmap-gate blocks arrive as stopReason 'blocked' from current CLIs and as 'no_work'
	// from pre-fix history — the exact summary prefix is stable across both. Without this
	// branch the historical ones rendered as a neutral grey "No work" and the block went
	// unnoticed.
	if (
		(reason === 'blocked' || reason === 'no_work') &&
		(run.summary ?? '').includes('Roadmap gate blocked')
	) {
		return {
			label: 'Blocked: roadmap',
			title: 'The roadmap gate blocked work selection — feature directories are missing milestone assignments or reference invalid milestones. Fix .aidd/roadmap.json mappings.',
			tone: 'red',
		};
	}
	if (reason === 'blocked') {
		if ((run.summary ?? '').includes('completion_marker')) {
			return {
				label: 'Completed (warnings)',
				title: 'Work landed but completion markers were missing or unaccepted.',
				tone: 'amber',
			};
		}
		return {
			label: 'Blocked: gate',
			title: 'A gate (roadmap or validation) stopped the run before it could complete.',
			tone: 'red',
		};
	}
	if (reason === 'completed' && (run.exitCode ?? 0) === 0) {
		return { label: 'Success', title: 'Run completed successfully.', tone: 'emerald' };
	}
	if (reason === 'no_work') {
		return { label: 'No work', title: 'No actionable work was selected.', tone: 'neutral' };
	}
	if (reason === 'stop_requested') {
		return { label: 'Stopped', title: 'Run stopped on request.', tone: 'neutral' };
	}
	if (reason === 'max_iterations') {
		return {
			label: 'Max iterations',
			title: 'Run hit the iteration limit before finishing.',
			tone: 'amber',
		};
	}
	if (reason === 'wall_clock_budget') {
		return {
			label: 'Time budget',
			title: 'Run stopped short of its deadline: too little wall-clock budget remained to finish another iteration.',
			tone: 'amber',
		};
	}
	if (reason === 'merge_conflict_parked') {
		return {
			label: 'Awaiting merge',
			title: 'Work landed in an isolated worktree but the merge-back is parked for manual resolution.',
			tone: 'amber',
		};
	}
	if (reason === 'metadata_conflict_parked') {
		return {
			label: 'Parked: metadata conflict',
			title: 'A .aidd metadata file the run changed also changed canonically mid-run; the metadata delta was withheld and the worktree preserved for manual reconciliation.',
			tone: 'amber',
		};
	}
	if (reason === 'exit_error') {
		const decoded = decodeExitCode(run.exitCode);
		if (decoded) return decoded;
		return { label: 'Error', title: 'Run ended with an error.', tone: 'red' };
	}
	return { label: humanizeStatus(reason), title: `Stop reason: ${reason}`, tone: 'neutral' };
}

export function classifyIteration(iteration: ProjectLocalIteration): OutcomeClassification {
	if (iteration.scopeOverrun) {
		return {
			label: 'Scope overrun',
			title: 'Completed feature(s) outside the selected scope.',
			tone: 'red',
		};
	}
	if (iteration.completionMarkerIssue) {
		return {
			label: 'Marker warning',
			title: iteration.completionMarkerIssue,
			tone: 'amber',
		};
	}
	const status = iteration.status;
	const label = humanizeStatus(status);
	if (status === 'running') {
		return { label, title: 'Iteration is in progress.', tone: 'teal' };
	}
	if (status === 'success') {
		const failedChecks = iterationFinalCheckFailures(iteration.finalChecks);
		if (failedChecks.length > 0) {
			const names = failedChecks.map(finalCheckLabel).join(', ');
			return {
				label: 'Success · check failed',
				title: `Iteration exited 0, but a recorded final acceptance check failed: ${names}. Exit code is preserved; treat the success as unverified.`,
				tone: 'amber',
			};
		}
		return { label, title: 'Iteration completed successfully.', tone: 'emerald' };
	}
	if (status === 'active_verification_recovery') {
		return {
			label,
			title: 'Targeted verification passed; the broad gate timed out.',
			tone: 'amber',
		};
	}
	if (status === 'verification_lifecycle_conflict') {
		return {
			label,
			title: 'Server lifecycle conflict during verification.',
			tone: 'amber',
		};
	}
	if (failingIterationStatuses.has(status)) {
		return { label, title: `Iteration outcome: ${status}.`, tone: 'red' };
	}
	return { label, title: `Iteration outcome: ${status}.`, tone: 'neutral' };
}
