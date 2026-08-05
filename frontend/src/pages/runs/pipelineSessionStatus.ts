import type { PipelineSessionStatus, PipelineStepStatus } from '../../api/types.ts';
import type { Tone } from '../../lib/tones.ts';

/**
 * The one status→tone map for sessions and their steps.
 *
 * Three copies of this mapping existed (here, `sessionTone` on the report page and `stepTone` in
 * StepOutput), and the report page's copy also returned the raw status string as its label — so the
 * same session read "completed" on the report and "Completed" in the Runs table.
 */
export function sessionStatusTone(status: PipelineSessionStatus | PipelineStepStatus): Tone {
	if (status === 'completed') return 'emerald';
	if (status === 'failed') return 'red';
	if (status === 'running' || status === 'queued') return 'teal';
	return 'amber';
}

const sessionLabels: Record<PipelineSessionStatus, string> = {
	completed: 'Completed',
	completed_with_failures: 'Completed with failures',
	failed: 'Failed',
	queued: 'Queued',
	running: 'Running',
	stopped: 'Stopped',
};

const stepLabels: Record<PipelineStepStatus, string> = {
	completed: 'Completed',
	failed: 'Failed',
	queued: 'Queued',
	running: 'Running',
	skipped: 'Skipped',
	stopped: 'Stopped',
};

export function sessionStatusLabel(status: PipelineSessionStatus): string {
	return sessionLabels[status];
}

export function stepStatusLabel(status: PipelineStepStatus): string {
	return stepLabels[status];
}

export function isSessionActive(status: PipelineSessionStatus): boolean {
	return status === 'queued' || status === 'running';
}

export function sessionStopUnavailableReason(status: PipelineSessionStatus): null | string {
	if (status === 'completed') return 'Stop unavailable: session completed';
	if (status === 'failed') return 'Stop unavailable: session failed';
	if (status === 'stopped') return 'Stop unavailable: session already stopped';
	if (status === 'completed_with_failures')
		return 'Stop unavailable: session completed with failures';
	return null;
}
