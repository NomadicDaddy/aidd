import type { PipelineSessionRecord } from '../api/types.ts';

/**
 * Names the steps a session recorded as skipped, so a session that ended early — a coding step
 * that found no work skips the review after it — does not read as one that stalled.
 * @param session The session.
 * @returns ` · N skipped`, or empty when nothing was skipped.
 */
export function pipelineSkippedSuffix(session: PipelineSessionRecord): string {
	return session.skippedTopLevelSteps > 0 ? ` · ${session.skippedTopLevelSteps} skipped` : '';
}

export function pipelineProgressLabel(session: PipelineSessionRecord): string {
	const completed = `${session.completedTopLevelSteps}/${session.totalSteps} completed${pipelineSkippedSuffix(session)}`;
	const active = session.activeTopLevelStep;
	return active ? `${completed} · step ${active.sequenceNumber} active` : completed;
}

export function pipelineActiveStepLabel(session: PipelineSessionRecord): null | string {
	const active = session.activeTopLevelStep;
	return active ? `Active step ${active.sequenceNumber} — ${active.stepName}` : null;
}

export function pipelineStepsCompletedLabel(session: PipelineSessionRecord): string {
	const noun = session.totalSteps === 1 ? 'step' : 'steps';
	return `${session.completedTopLevelSteps} / ${session.totalSteps} ${noun} completed${pipelineSkippedSuffix(session)}`;
}
