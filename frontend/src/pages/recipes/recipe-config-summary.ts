import type { RecipeConfigValue, RecipeStepDefinition, RecipeStepType } from '../../api/types.ts';

export interface ConfigSummaryEntry {
	key: string;
	label: string;
	labelIsMachine: boolean;
	value: string;
}

export interface StepBehaviorSummary {
	postHook: ConfigSummaryEntry[];
	preHook: ConfigSummaryEntry[];
	when: { equals: string; parameter: string } | null;
}

/**
 * The keys worth reading first, per step type. This is an ordering, not an emphasis: all entries
 * are machine values, so they share one treatment and only their reading order differs.
 */
const primaryKeysByType: Partial<Record<RecipeStepType, string[]>> = {
	'aidd-cli': ['backend', 'auditAll', 'command', 'prompt', 'maxIterations'],
	'recipe-ref': ['recipeName'],
	shell: ['command'],
	skill: ['skillId', 'executionIntent', 'args'],
};

const configLabels: Record<string, string> = {
	args: 'Arguments',
	auditAll: 'Audit all',
	backend: 'CLI',
	command: 'Command',
	executionIntent: 'Intent',
	maxIterations: 'Max iterations',
	params: 'Parameters',
	prompt: 'Prompt',
	recipeName: 'Recipe',
	skillId: 'Skill',
};

function formatValue(value: unknown): string {
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	if (typeof value === 'number') return String(value);
	if (typeof value === 'string') return value;
	if (Array.isArray(value)) return value.map((entry) => formatValue(entry)).join(', ');
	if (value === null) return 'null';
	return JSON.stringify(value);
}

function configSummaryEntry(key: string, value: RecipeConfigValue): ConfigSummaryEntry {
	const label = configLabels[key];
	return {
		key,
		label: label ?? key,
		labelIsMachine: label === undefined,
		value: formatValue(value),
	};
}

export function getConfigSummary(
	stepType: RecipeStepType,
	configJson: Record<string, RecipeConfigValue>,
): ConfigSummaryEntry[] {
	const primaries = primaryKeysByType[stepType] ?? [];
	const entries: ConfigSummaryEntry[] = [];
	for (const key of primaries) {
		const value = configJson[key];
		if (value !== undefined) entries.push(configSummaryEntry(key, value));
	}
	for (const [key, value] of Object.entries(configJson)) {
		if (primaries.includes(key)) continue;
		entries.push(configSummaryEntry(key, value));
	}
	return entries;
}

export function getStepBehaviorSummary(
	step: Pick<RecipeStepDefinition, 'postHookJson' | 'preHookJson' | 'when'>,
): StepBehaviorSummary {
	return {
		postHook: step.postHookJson ? getConfigSummary('shell', step.postHookJson) : [],
		preHook: step.preHookJson ? getConfigSummary('shell', step.preHookJson) : [],
		when: step.when ?? null,
	};
}
