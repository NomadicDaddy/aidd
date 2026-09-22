import type { PipelineSessionRecord } from '../../api/types.ts';

import { pipelineSkippedSuffix } from '../../lib/pipelineProgress.ts';
import { sessionStatusLabel } from '../runs/pipelineSessionStatus.ts';

export function pipelineSessionStepSummary(session: PipelineSessionRecord): string {
	const completedSteps = session.completedTopLevelSteps;
	const active = session.activeTopLevelStep;
	const skipped = pipelineSkippedSuffix(session);
	const remaining = Math.max(
		session.totalSteps - completedSteps - session.skippedTopLevelSteps - (active ? 1 : 0),
		0,
	);
	const parkedSuffix = session.parkedWorkRuns > 0 ? ` · ${session.parkedWorkRuns} parked` : '';

	if (active) {
		return `${completedSteps} completed${skipped} · step ${active.sequenceNumber} active — ${active.stepName} · ${remaining} remaining`;
	}
	if (session.status === 'queued') {
		return `${completedSteps} of ${session.totalSteps} steps completed${skipped} · waiting to start`;
	}
	if (session.status === 'running') {
		return `${completedSteps} of ${session.totalSteps} steps completed${skipped} · waiting for the next step`;
	}
	if (completedSteps < session.totalSteps) {
		const stepNoun = session.totalSteps === 1 ? 'step' : 'steps';
		return `${sessionStatusLabel(session.status)}: ${completedSteps} of ${session.totalSteps} ${stepNoun} completed${skipped}${parkedSuffix}`;
	}
	if (session.totalSteps === 1) {
		return `Step ${sessionStatusLabel(session.status).toLowerCase()}${parkedSuffix}`;
	}
	return session.status === 'completed'
		? `All ${session.totalSteps} steps completed${parkedSuffix}`
		: `All ${session.totalSteps} steps completed · session ${sessionStatusLabel(session.status).toLowerCase()}${parkedSuffix}`;
}
