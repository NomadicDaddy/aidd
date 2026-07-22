export const persistedReasoningEffortValues = [
	'none',
	'minimal',
	'low',
	'medium',
	'high',
	'xhigh',
] as const;

export const reasoningEffortValues = [...persistedReasoningEffortValues, 'max'] as const;
export type PersistedReasoningEffortValue = (typeof persistedReasoningEffortValues)[number];
export type ReasoningEffortValue = (typeof reasoningEffortValues)[number];

export const thinkingLevelValues = ['low', 'medium', 'high'] as const;
export type ThinkingLevelValue = (typeof thinkingLevelValues)[number];

const reasoningEffortAliases = new Map<string, ReasoningEffortValue>([
	['extra-high', 'xhigh'],
	['extra high', 'xhigh'],
	['extra_high', 'xhigh'],
	['x-high', 'xhigh'],
]);

function normalizeEnumToken(raw: string): string {
	return raw.trim().toLowerCase();
}

export function normalizeReasoningEffort(raw: string): ReasoningEffortValue | undefined {
	const normalized = normalizeEnumToken(raw);
	const alias = reasoningEffortAliases.get(normalized);
	if (alias !== undefined) return alias;
	return (reasoningEffortValues as readonly string[]).includes(normalized)
		? (normalized as ReasoningEffortValue)
		: undefined;
}

export function isPersistedReasoningEffort(
	value: ReasoningEffortValue
): value is PersistedReasoningEffortValue {
	return (persistedReasoningEffortValues as readonly string[]).includes(value);
}

export function normalizeThinkingLevel(raw: string): ThinkingLevelValue | undefined {
	const normalized = normalizeEnumToken(raw);
	return (thinkingLevelValues as readonly string[]).includes(normalized)
		? (normalized as ThinkingLevelValue)
		: undefined;
}

export const validFilterFields = new Set([
	'id',
	'category',
	'description',
	'title',
	'status',
	'priority',
	'passes',
	'dependencies',
	'spec',
	'model',
	'error',
	'summary',
	'branchName',
	'startedAt',
	'createdAt',
	'updatedAt',
	'skipTests',
	'thinkingLevel',
	'reasoningEffort',
	'planningMode',
	'requirePlanApproval',
]);

export const numberFlags = new Set([
	'--max-iterations',
	'--timeout',
	'--idle-timeout',
	'--idle-nudge-timeout',
	'--dirty-tree-threshold',
	'--no-work-backoff-ms',
	'--quit-on-abort',
	'--port',
]);
