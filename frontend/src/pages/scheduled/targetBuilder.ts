import type { ScheduledTaskTarget } from 'aidd-shared/contracts/scheduled-tasks';

import type { LaunchTargetValue } from '../../api/types/launchDefaults.ts';

// Every target a form can produce. The Director cycle is deliberately absent: it is built in, so it
// is neither created nor re-pointed from the form.
export type SelectableTargetType = Exclude<ScheduledTaskTarget['type'], 'director'>;

export function buildScheduledTarget(input: {
	applyChanges: boolean;
	args: string;
	launchTarget: LaunchTargetValue;
	parameters: Record<string, string>;
	targetId: string;
	targetType: SelectableTargetType;
}): ScheduledTaskTarget {
	if (input.targetType === 'skill') {
		return {
			args: input.args,
			executionIntent: input.applyChanges ? 'apply-changes' : 'review-only',
			launchTarget: input.launchTarget,
			skillId: input.targetId,
			type: 'skill',
		};
	}
	if (input.targetType === 'recipe') {
		return {
			applyChanges: input.applyChanges,
			launchTarget: input.launchTarget,
			parameters: input.parameters,
			recipeId: input.targetId,
			type: 'recipe',
		};
	}
	return {
		auditAll: input.targetId === '*',
		auditNames: input.targetId === '*' ? [] : [input.targetId],
		launchTarget: input.launchTarget,
		review: !input.applyChanges,
		type: 'audit',
	};
}
