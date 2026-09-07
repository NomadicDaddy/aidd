import { isSkillExecutionIntent } from 'aidd-shared/skill-execution-intent';

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
	skillExecutionIntent: string;
	stepType: RecipeStepType;
	whenEquals: string;
	whenParameter: string;
}

export interface StepJsonErrors {
	configJson: null | string;
	executionIntent: null | string;
	name: null | string;
	postHookJson: null | string;
	preHookJson: null | string;
	when: null | string;
}

/** Keep required-name validation complete while withholding it until the operator engages. */
export function stepNameErrorForDisplay(
	error: null | string,
	nameTouched: boolean,
	submitAttempted: boolean,
): null | string {
	return nameTouched || submitAttempted ? error : null;
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

const configIdentityKeys: Partial<Record<RecipeStepType, string>> = {
	'recipe-ref': 'recipeName',
	shell: 'command',
	skill: 'skillId',
};

function validateStepConfigShape(step: StepDraft, label: string): null | string {
	if (!step.configJson.trim()) return null;
	let config: Record<string, RecipeConfigValue>;
	try {
		config = parseConfigJson(step.configJson, `${label} configJson`);
	} catch {
		return null;
	}
	const expectedKey = configIdentityKeys[step.stepType];
	if (!expectedKey || expectedKey in config || Object.keys(config).length === 0) return null;
	const belongsToAnotherType = Object.values(configIdentityKeys).some((key) => key in config);
	return belongsToAnotherType
		? `Config JSON does not match ${step.stepType}; expected a ${expectedKey} key`
		: null;
}

function skillConfigExecutionIntentError(step: StepDraft, label: string): null | string {
	if (step.stepType !== 'skill') return null;
	let config: Record<string, RecipeConfigValue>;
	try {
		config = parseConfigJson(step.configJson, `${label} configJson`);
	} catch {
		return null;
	}
	if (!('executionIntent' in config)) return null;
	return config.executionIntent === step.skillExecutionIntent
		? 'Config JSON duplicates Execution intent; remove executionIntent and use the select'
		: 'Config JSON executionIntent conflicts with the Execution intent select; remove it and use the select';
}

function editableStepConfig(step: RecipeStepDefinition): Record<string, RecipeConfigValue> {
	if (step.stepType !== 'skill') return step.configJson;
	return Object.fromEntries(
		Object.entries(step.configJson).filter(([key]) => key !== 'executionIntent'),
	);
}

export function collectStepErrors(step: StepDraft, stepNumber = 1): StepJsonErrors {
	const hasWhenParameter = step.whenParameter.trim().length > 0;
	const hasWhenEquals = step.whenEquals.trim().length > 0;
	// A new step arrives unnamed, so the message has to survive an empty name rather than quoting
	// one: `Step "" configJson is not valid JSON` named nothing at all.
	const label = step.name.trim() ? `Step "${step.name.trim()}"` : `Step ${stepNumber}`;
	const configJsonError = validateJsonField(step.configJson, `${label} configJson`);
	return {
		configJson:
			configJsonError ??
			validateStepConfigShape(step, label) ??
			skillConfigExecutionIntentError(step, label),
		executionIntent:
			step.stepType === 'skill' && !isSkillExecutionIntent(step.skillExecutionIntent)
				? 'Choose Review only or Apply changes; the saved executionIntent is not recognised'
				: null,
		name: step.name.trim() ? null : 'Step name is required',
		postHookJson: validateJsonField(step.postHookJson, `${label} postHookJson`),
		preHookJson: validateJsonField(step.preHookJson, `${label} preHookJson`),
		when:
			hasWhenParameter === hasWhenEquals
				? null
				: 'Condition parameter and expected value must both be set',
	};
}

export function toDrafts(recipe: RecipeDefinition): StepDraft[] {
	return recipe.steps.map((step) => ({
		configJson: JSON.stringify(editableStepConfig(step), null, 2),
		id: step.id,
		name: step.name,
		onFailure: step.onFailure ?? 'stop',
		postHookJson: step.postHookJson ? JSON.stringify(step.postHookJson, null, 2) : '',
		preHookJson: step.preHookJson ? JSON.stringify(step.preHookJson, null, 2) : '',
		retryCount: step.retryCount === undefined ? '' : String(step.retryCount),
		skillExecutionIntent:
			typeof step.configJson.executionIntent === 'string'
				? step.configJson.executionIntent
				: '',
		stepType: step.stepType,
		whenEquals: step.when?.equals ?? '',
		whenParameter: step.when?.parameter ?? '',
	}));
}

/**
 * The drafts reduced to the fields the policy summary reads, and nothing else.
 *
 * `toStep` is the wrong tool here: it parses the JSON fields, so it throws on a half-typed brace,
 * and this runs on every keystroke of an open form. Every value the policy summary looks at —
 * failure behaviour, retry count, execution intent — is a first-class field on the draft, so none of
 * them needs the JSON parsed at all. The config is emptied rather than parsed, and the one key the
 * summary reads out of it is written back from the draft's own field.
 */
export function policyStepsFromDrafts(drafts: readonly StepDraft[]): RecipeStepDefinition[] {
	return drafts.map((draft) => {
		const retryCount = Number(draft.retryCount);
		return {
			configJson:
				draft.stepType === 'skill' && isSkillExecutionIntent(draft.skillExecutionIntent)
					? { executionIntent: draft.skillExecutionIntent }
					: {},
			id: draft.id,
			name: draft.name,
			...(draft.onFailure === 'stop' ? {} : { onFailure: draft.onFailure }),
			...(draft.retryCount.trim() && Number.isInteger(retryCount) && retryCount >= 0
				? { retryCount }
				: {}),
			stepType: draft.stepType,
		};
	});
}

export function toStep(draft: StepDraft): RecipeStepDefinition {
	const configJson = parseConfigJson(draft.configJson, `${draft.name} configJson`);
	if (draft.stepType === 'skill') {
		if ('executionIntent' in configJson) {
			throw new Error(
				`${draft.name} configJson must not contain executionIntent; use the Execution intent select`,
			);
		}
		if (!isSkillExecutionIntent(draft.skillExecutionIntent)) {
			throw new Error(`${draft.name} has an unrecognised executionIntent`);
		}
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

/** What a new step's name field suggests before anything is typed into it. */
export function newStepNamePlaceholder(stepType: RecipeStepType): string {
	return `New ${stepType} step`;
}

const configPlaceholders: Record<RecipeStepType, string> = {
	'aidd-cli': '{\n  "maxIterations": 1,\n  "prompt": "Describe the task"\n}',
	'recipe-ref': '{\n  "recipeName": "recipe-name",\n  "params": {}\n}',
	shell: '{\n  "command": "bun run smoke:qc"\n}',
	skill: '{\n  "skillId": "skill-name",\n  "args": "{application}"\n}',
};

/** Type-specific guidance for an empty config field; never persisted as a draft value. */
export function stepConfigPlaceholder(stepType: RecipeStepType): string {
	return configPlaceholders[stepType];
}

/**
 * Moves a step within the list, returning a new array.
 *
 * An out-of-range move is a copy rather than a throw: the editor disables the control at each end
 * of the list, and a reorder that lost a race with a delete should be a no-op, not a crash.
 */
export function moveStep<T>(items: readonly T[], from: number, to: number): T[] {
	if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
		return [...items];
	}
	const moved = items[from];
	if (moved === undefined) return [...items];
	const next = items.filter((_, index) => index !== from);
	next.splice(to, 0, moved);
	return next;
}

export function newStepDraft(): StepDraft {
	const id = `step_${crypto.randomUUID().slice(0, 8)}`;
	return {
		configJson: '',
		id,
		// Empty, with `newStepNamePlaceholder` on the input. Shipping the suggestion as a value made
		// "New shell step" a name three recipes deep in the file, because it is already filled in and
		// already valid — nothing on the form ever asked for it to be changed.
		name: '',
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
