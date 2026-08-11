import type { DirectorCycle, DirectorCycleStage, DirectorRiskLevel } from '../api/types.ts';
import type { Tone } from './tones.ts';

import { formatDuration } from './formatters.ts';

/**
 * How risky a director suggestion is, in one reading for the whole app.
 *
 * Three surfaces print the risk of the same record — the Director queue, the Dashboard's Director
 * Queue card, and the approval rows beneath it — and each had grown its own copy of the mapping.
 * Two of them disagreed: `LOW` came out emerald on the Director page and teal on the Dashboard, so
 * one suggestion changed colour depending on which route you read it from. Emerald is the app's
 * "nothing to do here" tone (the zero-open header badge, the healthy metric tiles); teal is the
 * accent, and an accent on the least urgent of three levels was the wrong end of the scale.
 *
 * The tone is deliberately not a treatment. The Director queue draws it as a `StatusDot` beside
 * muted text and the Dashboard draws it as a `Badge`, and that difference is intentional — a
 * generated batch is uniform, so 31 filled red pills down one column stop meaning anything, while
 * four mixed rows on a card benefit from the pill. What has to agree is the reading, not the shape.
 */
export function riskTone(risk: DirectorRiskLevel): Tone {
	if (risk === 'HIGH') return 'red';
	if (risk === 'MEDIUM') return 'amber';
	return 'emerald';
}

/**
 * The risk level as words, with the axis named.
 *
 * A bare `HIGH` sat one card away from a Feature Queue badge reading `P1`, so two vocabularies for
 * two unrelated concepts read as one. Saying "risk" is what separates them; risk is not priority,
 * so it does not become a P-number.
 */
export function riskLabel(risk: DirectorRiskLevel): string {
	if (risk === 'HIGH') return 'High risk';
	if (risk === 'MEDIUM') return 'Medium risk';
	return 'Low risk';
}

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
