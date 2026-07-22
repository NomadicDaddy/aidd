import type { OrchestratorState } from './state.ts';

const allowedTransitions: Record<OrchestratorState['type'], OrchestratorState['type'][]> = {
	compile_prompt: ['run_agent', 'process_result', 'stopped', 'failed'],
	complete: [],
	failed: [],
	planning: ['select_work', 'stopped', 'failed', 'complete'],
	process_result: ['write_artifacts', 'stopped', 'failed'],
	run_agent: ['process_result', 'stopped', 'failed'],
	select_work: ['compile_prompt', 'stopped', 'failed'],
	stopped: [],
	write_artifacts: ['select_work', 'complete', 'stopped', 'failed'],
};

export class InvalidTransitionError extends Error {
	constructor(from: OrchestratorState['type'], to: OrchestratorState['type']) {
		super(`Invalid orchestrator transition: ${from} -> ${to}`);
		this.name = 'InvalidTransitionError';
	}
}

export function transition(from: OrchestratorState, to: OrchestratorState): OrchestratorState {
	if (!allowedTransitions[from.type].includes(to.type)) {
		throw new InvalidTransitionError(from.type, to.type);
	}
	return to;
}
