export const skillExecutionIntents = ['review-only', 'apply-changes'] as const;

export type SkillExecutionIntent = (typeof skillExecutionIntents)[number];

export function isSkillExecutionIntent(value: unknown): value is SkillExecutionIntent {
	return (
		typeof value === 'string' && skillExecutionIntents.includes(value as SkillExecutionIntent)
	);
}

export function skillExecutionIntentLabel(intent: SkillExecutionIntent): string {
	return intent === 'review-only' ? 'Review only' : 'Changes allowed';
}
