import { TASK_WEIGHTS } from './tasks.js';

export function weightedScore(result) {
	return (
		result.correctness * TASK_WEIGHTS.correctness +
		result.reliability * TASK_WEIGHTS.reliability +
		result.time * TASK_WEIGHTS.time
	);
}
