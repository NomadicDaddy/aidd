import {
	isSkillExecutionIntent,
	type SkillExecutionIntent,
} from 'aidd-shared/skill-execution-intent';

import type {
	RecipeConfigValue,
	RecipeDefinition,
	RecipeStepDefinition,
	RecipeStepOnFailure,
	RecipeStepType,
} from '../../api/types.ts';

export interface StepDraft {
	configJson: string;
	id: string;
	name: string;
	onFailure: RecipeStepOnFailure;
	postHookJson: string;
	preHookJson: string;
	retryCount: string;
	skillExecutionIntent: SkillExecutionIntent;
	stepType: RecipeStepType;
	whenEquals: string;
	whenParameter: string;
}

export interface StepJsonErrors {
	configJson: null | string;
	postHookJson: null | string;
	preHookJson: null | string;
	when: null | string;
}

function isConfigValue(value: unknown): value is RecipeConfigValue {
	if (
		value === null ||
		typeof value === 'boolean' ||
		typeof value === 'number' ||
		typeof value === 'string'
	) {
		return true;
	}
	if (Array.isArray(value)) return value.every(isConfigValue);
	if (typeof value !== 'object' || value === null) return false;
	return Object.values(value as Record<string, unknown>).every(isConfigValue);
}

export function parseConfigJson(text: string, label: string): Record<string, RecipeConfigValue> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text || '{}') as unknown;
	} catch (err) {
		const detail = err instanceof Error ? err.message : 'invalid JSON';
		throw new Error(`${label} is not valid JSON: ${detail}`, { cause: err });
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new Error(`${label} must be a JSON object`);
	}
	if (!isConfigValue(parsed)) throw new Error(`${label} contains unsupported JSON values`);
	return parsed as Record<string, RecipeConfigValue>;
}

function validateJsonField(value: string, label: string): null | string {
	if (!value.trim()) return null;
	try {
		parseConfigJson(value, label);
		return null;
	} catch (error) {
		return error instanceof Error ? error.message : `${label} is invalid JSON`;
	}
}

export function collectStepErrors(step: StepDraft): StepJsonErrors {
	const hasWhenParameter = step.whenParameter.trim().length > 0;
	const hasWhenEquals = step.whenEquals.trim().length > 0;
	const configJsonError = validateJsonField(step.configJson, `Step "${step.name}" configJson`);
	return {
		configJson:
			configJsonError ??
			(step.stepType === 'skill' && !isSkillExecutionIntent(step.skillExecutionIntent)
				? 'Skill steps require Review only or Apply changes execution intent'
				: null),
		postHookJson: validateJsonField(step.postHookJson, `Step "${step.name}" postHookJson`),
		preHookJson: validateJsonField(step.preHookJson, `Step "${step.name}" preHookJson`),
		when:
			hasWhenParameter === hasWhenEquals
				? null
				: 'Condition parameter and expected value must both be set',
	};
}

export function toDrafts(recipe: RecipeDefinition): StepDraft[] {
	return recipe.steps.map((step) => ({
		configJson: JSON.stringify(step.configJson, null, 2),
		id: step.id,
		name: step.name,
		onFailure: step.onFailure ?? 'stop',
		postHookJson: step.postHookJson ? JSON.stringify(step.postHookJson, null, 2) : '',
		preHookJson: step.preHookJson ? JSON.stringify(step.preHookJson, null, 2) : '',
		retryCount: step.retryCount === undefined ? '' : String(step.retryCount),
		skillExecutionIntent: isSkillExecutionIntent(step.configJson.executionIntent)
			? step.configJson.executionIntent
			: 'review-only',
		stepType: step.stepType,
		whenEquals: step.when?.equals ?? '',
		whenParameter: step.when?.parameter ?? '',
	}));
}

export function toStep(draft: StepDraft): RecipeStepDefinition {
	const configJson = parseConfigJson(draft.configJson, `${draft.name} configJson`);
	if (draft.stepType === 'skill') {
		configJson.executionIntent = draft.skillExecutionIntent;
	}
	const step: RecipeStepDefinition = {
		configJson,
		id: draft.id,
		name: draft.name,
		stepType: draft.stepType,
	};
	if (draft.onFailure !== 'stop') step.onFailure = draft.onFailure;
	if (draft.preHookJson.trim()) {
		step.preHookJson = parseConfigJson(draft.preHookJson, `${draft.name} preHookJson`);
	}
	if (draft.postHookJson.trim()) {
		step.postHookJson = parseConfigJson(draft.postHookJson, `${draft.name} postHookJson`);
	}
	if (draft.whenParameter.trim() && draft.whenEquals.trim()) {
		step.when = {
			equals: draft.whenEquals.trim(),
			parameter: draft.whenParameter.trim(),
		};
	}
	const retryCount = Number(draft.retryCount);
	if (draft.retryCount.trim() && Number.isInteger(retryCount) && retryCount >= 0) {
		step.retryCount = retryCount;
	}
	return step;
}

export interface ConfigSummaryEntry {
	key: string;
	label: string;
	primary?: boolean;
	value: string;
}

const primaryKeysByType: Partial<Record<RecipeStepType, string[]>> = {
	'aidd-cli': ['backend', 'auditAll', 'command', 'prompt', 'maxIterations'],
	'recipe-ref': ['recipeName'],
	shell: ['command'],
	skill: ['skillId', 'executionIntent', 'args'],
};

function formatValue(value: unknown): string {
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	if (typeof value === 'number') return String(value);
	if (typeof value === 'string') return value;
	if (Array.isArray(value)) return value.map((v) => formatValue(v)).join(', ');
	if (value === null) return 'null';
	return JSON.stringify(value);
}

export function getConfigSummary(
	stepType: RecipeStepType,
	configJson: Record<string, RecipeConfigValue>
): ConfigSummaryEntry[] {
	const primaries = primaryKeysByType[stepType] ?? [];
	const entries: ConfigSummaryEntry[] = [];
	for (const key of primaries) {
		if (key in configJson) {
			entries.push({ key, label: key, primary: true, value: formatValue(configJson[key]) });
		}
	}
	for (const [key, value] of Object.entries(configJson)) {
		if (primaries.includes(key)) continue;
		entries.push({ key, label: key, value: formatValue(value) });
	}
	return entries;
}

export function newStepDraft(): StepDraft {
	const id = `step_${crypto.randomUUID().slice(0, 8)}`;
	return {
		configJson: '{\n  "command": "bun run smoke:qc"\n}',
		id,
		name: 'New shell step',
		onFailure: 'stop',
		postHookJson: '',
		preHookJson: '',
		retryCount: '',
		skillExecutionIntent: 'review-only',
		stepType: 'shell',
		whenEquals: '',
		whenParameter: '',
	};
}
