import type { PipelineSessionRecord } from '../../api/types.ts';

export function sessionStatusTone(status: PipelineSessionRecord['status']) {
	if (status === 'completed') return 'emerald';
	if (status === 'failed') return 'red';
	if (status === 'running' || status === 'queued') return 'teal';
	return 'amber';
}

export function sessionStatusLabel(status: PipelineSessionRecord['status']): string {
	const labels: Record<PipelineSessionRecord['status'], string> = {
		completed: 'Completed',
		completed_with_failures: 'Completed with failures',
		failed: 'Failed',
		queued: 'Queued',
		running: 'Running',
		stopped: 'Stopped',
	};
	return labels[status];
}

export function isSessionActive(status: PipelineSessionRecord['status']): boolean {
	return status === 'queued' || status === 'running';
}

export function sessionStopUnavailableReason(
	status: PipelineSessionRecord['status'],
): null | string {
	if (status === 'completed') return 'Stop unavailable: session completed';
	if (status === 'failed') return 'Stop unavailable: session failed';
	if (status === 'stopped') return 'Stop unavailable: session already stopped';
	if (status === 'completed_with_failures')
		return 'Stop unavailable: session completed with failures';
	return null;
}
