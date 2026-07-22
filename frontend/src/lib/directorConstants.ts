import type { DirectorCycle, DirectorCycleStage } from '../api/types.ts';

import { formatDuration } from './formatters.ts';

export const cycleStageLabels: Record<DirectorCycleStage, string> = {
	completed: 'Completed',
	failed: 'Failed',
	persisting_results: 'Saving results',
	preparing_fleet_summary: 'Preparing fleet summary',
	running_backend: 'Director backend running',
	running_direct_ai: 'Direct AI running',
	starting: 'Starting',
	writing_context: 'Writing cycle context',
};

export const cycleStageDescriptions: Record<DirectorCycleStage, string> = {
	completed: 'Suggestions and cycle metadata have been saved.',
	failed: 'The cycle ended before producing usable director output.',
	persisting_results: 'The director output is being checked and saved.',
	preparing_fleet_summary: 'aidd is collecting current project, backlog, and health signals.',
	running_backend: 'The configured director backend is analyzing the fleet.',
	running_direct_ai:
		'The configured Direct AI provider is analyzing the fleet summary and producing suggestions.',
	starting: 'The cycle record has been created and the cycle files are being prepared.',
	writing_context: 'aidd is writing the directive and chat context for this cycle.',
};

export function cycleElapsed(cycle: DirectorCycle, now: number): string {
	return formatDuration((cycle.completedAt ?? now) - cycle.startedAt);
}
