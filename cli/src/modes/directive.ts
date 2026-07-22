import type { ModeContext, ModeHandler, ModeResult, SelectedWork } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import { createPlanBackedMode } from './base.ts';

// Directive runs (skill pipeline steps) execute their supplied prompt
// verbatim. They deliberately do not select or claim a backlog feature: the
// agent's directive is the unit of work, and completion is judged solely by the
// backend exit code. Returning `generic` work keeps the backend running (unlike
// `none`, which the orchestrator skips) while leaving every feature untouched.
export function createDirectiveMode(plan: RunPlan): ModeHandler {
	const base = createPlanBackedMode(plan);
	return {
		...base,
		async buildPromptPlan() {
			return plan.prompt;
		},
		name: 'directive',
		async processResult(_context, result): Promise<ModeResult> {
			return {
				complete: result.exitCode === 0,
				summary: result.skipped
					? 'directive run skipped'
					: `directive run finished with exit code ${result.exitCode}`,
			};
		},
		async selectWork(_context: ModeContext): Promise<SelectedWork> {
			return {
				description: 'directive run',
				id: 'directive',
				kind: 'generic',
			};
		},
	};
}
