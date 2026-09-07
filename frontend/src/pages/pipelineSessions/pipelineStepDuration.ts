import type { PipelineStepResultRecord } from '../../api/types.ts';

import { formatActiveDuration, formatDuration } from '../../lib/formatters.ts';

export function pipelineStepDuration(
	step: Pick<PipelineStepResultRecord, 'durationMs' | 'startedAt' | 'status'>,
	now: number,
): string {
	if (step.status === 'queued' || step.status === 'running') {
		return formatActiveDuration(step.durationMs, step.startedAt, now);
	}
	return step.durationMs === null ? '—' : formatDuration(step.durationMs);
}
