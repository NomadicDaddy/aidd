import { TASK_WEIGHTS } from './tasks.js';

export function weightedScore(result) {
	return (
		result.correctness * TASK_WEIGHTS.correctness +
		result.reliability * TASK_WEIGHTS.reliability +
		result.time * TASK_WEIGHTS.time
	);
}

// Average weighted score across agentic tasks; control tasks are excluded.
export function compositeScore(results) {
	const agentic = results.filter((result) => result.category === 'agentic');
	const total = agentic.reduce((sum, result) => sum + weightedScore(result), 0);
	return total / results.length;
}
