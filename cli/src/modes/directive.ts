import type { ModeContext, ModeHandler, ModeResult, SelectedWork } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import { createPlanBackedMode } from './base.ts';

// Directive runs execute their supplied prompt verbatim, whether launched by a pipeline step,
// skill, or operator. They deliberately do not select or claim a backlog feature: the
// agent's directive is the unit of work, and completion is judged solely by the
// backend exit code. Returning `generic` work keeps the backend running (unlike
// `none`, which the orchestrator skips) while leaving every feature untouched.
export function createDirectiveMode(plan: RunPlan): ModeHandler {
	const base = createPlanBackedMode(plan);
	// A skill run *is* a directive run, but the operator invoked a named skill and the web Runs
	// table labels it KIND=Skill. Summarizing it as "directive run" contradicts that label, so
	// name the skill whenever one compiled this prompt.
	const skillId = plan.prompt.skillId;
	const label = skillId === undefined ? 'directive run' : `skill '${skillId}' run`;
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
					? `${label} skipped`
					: `${label} finished with exit code ${result.exitCode}`,
			};
		},
		async selectWork(_context: ModeContext): Promise<SelectedWork> {
			return {
				description: label,
				id: 'directive',
				kind: 'generic',
			};
		},
	};
}
