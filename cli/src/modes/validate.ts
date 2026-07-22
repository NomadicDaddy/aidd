import type { ModeContext, ModeHandler, ModeResult, SelectedWork } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import { createPlanBackedMode } from './base.ts';

export function createValidateMode(plan: RunPlan): ModeHandler {
	const base = createPlanBackedMode(plan);
	return {
		...base,
		name: 'validate',
		async processResult(_context, result): Promise<ModeResult> {
			return {
				complete: result.exitCode === 0,
				summary: result.skipped
					? 'validate found no feature contract issues'
					: `validate finished with exit code ${result.exitCode}`,
			};
		},
		async selectWork(context: ModeContext): Promise<SelectedWork> {
			const validation = await context.store.validateFeatures({ includeAudit: true });
			if (validation.valid) {
				return {
					data: validation,
					description: 'All feature files satisfy the typed contract',
					id: 'validation-clean',
					kind: 'none',
				};
			}
			return {
				data: validation,
				description: `${validation.issues.length} feature contract issue(s) found`,
				id: validation.issues[0]?.id ?? 'validation-issues',
				kind: 'validation',
			};
		},
	};
}
