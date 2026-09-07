import type { RunPlan } from 'aidd-shared/plan/types';

import type { OrchestratorState } from '../state.ts';

import { transition } from '../transitions.ts';
import { type MoveFn, type OrchestratorDeps } from './types.ts';

export function createStateMove(plan: RunPlan, deps: OrchestratorDeps): MoveFn {
	let state: OrchestratorState = { type: 'planning' };
	return (next) => {
		state = transition(state, next);
		deps.onState?.(state);
		void deps.observer?.onState?.(state);
	};
}
