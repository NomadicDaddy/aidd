import {
	classifyWebRun,
	executionStatusPresentation,
	type WebRunOutcome,
	type WebRunOutcomeStatus,
} from 'aidd-shared/runs/outcome';

import type {
	DiaryTimelineItem,
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
// behind a clean "Completed".
export function iterationFinalCheckFailures(finalChecks: FinalCheckSummary | null): string[] {
	if (!finalChecks) return [];
	return Object.entries(finalChecks)
		.filter(([, status]) => status === 'failed')
		.map(([name]) => name);
}

export type OutcomeClassification = WebRunOutcome;

export function classifyDiaryTimelineRun(item: DiaryTimelineItem): null | OutcomeClassification {
	if (item.kind !== 'run' || !item.runOutcome) return null;
	return classifyWebRun(item.runOutcome);
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
	failure: executionStatusPresentation.failed.label,
	idle_timeout: 'Idle timeout',
	no_assistant: 'No assistant response',
	provider_error: 'Provider error',
	provider_flagged: 'Provider flagged',
	rate_limited: 'Rate limited',
	running: executionStatusPresentation.running.label,
	success: executionStatusPresentation.completed.label,
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

function webStatusForLocalRun(reason: string, exitCode: null | number): WebRunOutcomeStatus {
	if (reason === 'completed') return (exitCode ?? 0) === 0 ? 'completed' : 'failed';
	if (reason === 'no_work') return 'completed';
	if (reason === 'killed') return 'killed';
	if (reason === 'merge_conflict_parked' || reason === 'metadata_conflict_parked') {
		return 'waiting_approval';
	}
	if (reason === 'stop_requested') return 'stopped';
	return (exitCode ?? 0) === 0 ? 'completed' : 'failed';
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
	if (reason === 'unknown') {
		return { label: 'Unknown', title: 'Stop reason was not recorded.', tone: 'neutral' };
	}
	return classifyWebRun({
		exitCode: run.exitCode,
		status: webStatusForLocalRun(reason, run.exitCode),
		stopReason: reason,
		summary: run.summary,
	});
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
				label: 'Completed · check failed',
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
