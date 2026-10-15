import { executionStatusPresentation } from 'aidd-shared/runs/outcome';

import type { PipelineSessionStatus, PipelineStepStatus } from '../api/types.ts';
import type { Tone } from './tones.ts';

/**
 * The shared status→tone map for sessions, their steps, and scheduled occurrences.
 *
 * Three copies of this mapping existed (here, `sessionTone` on the report page and `stepTone` in
 * StepOutput), and the report page's copy also returned the raw status string as its label — so the
 * same session read "completed" on the report and "Completed" in the Runs table.
 */
export function sessionStatusTone(status: PipelineSessionStatus | PipelineStepStatus): Tone {
	return executionStatusPresentation[status].tone;
}

export function sessionStatusLabel(status: PipelineSessionStatus): string {
	return executionStatusPresentation[status].label;
}

/**
 * What a step's status badge shows. A step still in flight in a stopping session reads 'stopping':
 * its run was asked to stop and ends at its iteration boundary, after which the step records what
 * the run actually did.
 */
export type StepBadgeStatus = 'stopping' | PipelineStepStatus;

export function stepBadgeStatus(
	stepStatus: PipelineStepStatus,
	sessionStatus: PipelineSessionStatus,
): StepBadgeStatus {
	const inFlight = stepStatus === 'queued' || stepStatus === 'running';
	return inFlight && sessionStatus === 'stopping' ? 'stopping' : stepStatus;
}

export function stepStatusLabel(status: StepBadgeStatus): string {
	return executionStatusPresentation[status].label;
}

export function isSessionActive(status: PipelineSessionStatus): boolean {
	return status === 'queued' || status === 'running' || status === 'stopping';
}

/** The toast after a Stop: a session whose run is still working answers 'stopping', not stopped. */
export function sessionStopOutcomeMessage(status: PipelineSessionStatus): string {
	return status === 'stopping'
		? 'Stop requested: the session ends when its run reaches its iteration boundary'
		: 'Session stopped';
}

export function sessionStopUnavailableReason(status: PipelineSessionStatus): null | string {
	if (status === 'completed') return 'Stop unavailable: session completed';
	if (status === 'failed') return 'Stop unavailable: session failed';
	if (status === 'stopped') return 'Stop unavailable: session already stopped';
	if (status === 'completed_with_failures')
		return 'Stop unavailable: session completed with failures';
	return null;
}
