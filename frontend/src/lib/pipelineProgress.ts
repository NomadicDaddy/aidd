import type { PipelineSessionRecord } from '../api/types.ts';

export function pipelineProgressLabel(session: PipelineSessionRecord): string {
	const completed = `${session.completedTopLevelSteps}/${session.totalSteps} completed`;
	const active = session.activeTopLevelStep;
	return active ? `${completed} · step ${active.sequenceNumber} active` : completed;
}

export function pipelineActiveStepLabel(session: PipelineSessionRecord): null | string {
	const active = session.activeTopLevelStep;
	return active ? `Active step ${active.sequenceNumber} — ${active.stepName}` : null;
}

export function pipelineStepsCompletedLabel(session: PipelineSessionRecord): string {
	const noun = session.totalSteps === 1 ? 'step' : 'steps';
	return `${session.completedTopLevelSteps} / ${session.totalSteps} ${noun} completed`;
}
