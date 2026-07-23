import { isSkillExecutionIntent } from 'aidd-shared/skill-execution-intent';
import { isSystemRecipeId } from 'aidd-shared/system-recipes';
import { join } from 'node:path';

import type {
	RecipeConfigValue,
	RecipeDefinition,
	RecipeParameterDefinition,
	RecipeStepDefinition,
	RecipeStepOnFailure,
	RecipeStepType,
} from '../types.ts';

// Pure recipe parsing/validation helpers, split out of recipeService.ts so the on-disk I/O layer
// (RecipeService) and the structural normalization stay in separate, headroom-having modules.

export function isEnoent(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code: unknown }).code === 'ENOENT'
	);
}

const recipeIdPattern = /^[a-zA-Z0-9_-]+$/;
const stepTypes = new Set<RecipeStepType>(['aidd-cli', 'skill', 'recipe-ref', 'shell']);
const onFailureValues = new Set<RecipeStepOnFailure>(['auto-fix', 'continue', 'stop']);

export function isValidRecipeId(id: string): boolean {
	return recipeIdPattern.test(id);
}

export function recipePath(rootDir: string, id: string): string {
	if (!recipeIdPattern.test(id)) throw new Error(`Invalid recipe id: ${id}`);
	return join(rootDir, 'recipes', `${id}.json`);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRecipeConfigValue(value: unknown): value is RecipeConfigValue {
	if (
		value === null ||
		typeof value === 'boolean' ||
		typeof value === 'number' ||
		typeof value === 'string'
	) {
		return true;
	}
	if (Array.isArray(value)) return value.every(isRecipeConfigValue);
	if (!isRecord(value)) return false;
	return Object.values(value).every(isRecipeConfigValue);
}

function toConfigRecord(value: unknown): Record<string, RecipeConfigValue> {
	if (!isRecord(value)) return {};
	const config: Record<string, RecipeConfigValue> = {};
	for (const [key, entry] of Object.entries(value)) {
		if (isRecipeConfigValue(entry)) config[key] = entry;
	}
	return config;
}

function toParameters(value: unknown): RecipeParameterDefinition[] {
	if (!Array.isArray(value)) return [];
	const parameters: RecipeParameterDefinition[] = [];
	for (const entry of value) {
		if (!isRecord(entry) || typeof entry.name !== 'string' || entry.name.length === 0) {
			continue;
		}
		const parameter: RecipeParameterDefinition = { name: entry.name };
		if (typeof entry.description === 'string') parameter.description = entry.description;
		if (entry.defaultValue !== undefined && entry.defaultValue !== null) {
			parameter.defaultValue = String(entry.defaultValue);
		}
		parameters.push(parameter);
	}
	return parameters;
}

function toStep(
	entry: unknown,
	recipeId: string,
	sequenceNumber: number
): RecipeStepDefinition | undefined {
	if (!isRecord(entry) || typeof entry.name !== 'string' || entry.name.length === 0)
		return undefined;
	if (typeof entry.stepType !== 'string' || !stepTypes.has(entry.stepType as RecipeStepType)) {
		return undefined;
	}
	const configJson = toConfigRecord(entry.configJson);
	if (entry.stepType === 'skill' && !isSkillExecutionIntent(configJson.executionIntent)) {
		throw new Error(
			`Skill step "${entry.name}" must declare executionIntent as "review-only" or "apply-changes"`
		);
	}
	const step: RecipeStepDefinition = {
		configJson,
		id:
			typeof entry.id === 'string' && entry.id.length > 0
				? entry.id
				: `${recipeId}_step_${sequenceNumber}`,
		name: entry.name,
		stepType: entry.stepType as RecipeStepType,
	};
	if (
		typeof entry.onFailure === 'string' &&
		onFailureValues.has(entry.onFailure as RecipeStepOnFailure)
	) {
		step.onFailure = entry.onFailure as RecipeStepOnFailure;
	}
	if (isRecord(entry.preHookJson)) step.preHookJson = toConfigRecord(entry.preHookJson);
	if (isRecord(entry.postHookJson)) step.postHookJson = toConfigRecord(entry.postHookJson);
	if (
		typeof entry.retryCount === 'number' &&
		Number.isInteger(entry.retryCount) &&
		entry.retryCount >= 0
	) {
		step.retryCount = entry.retryCount;
	}
	if (
		isRecord(entry.when) &&
		typeof entry.when.parameter === 'string' &&
		entry.when.parameter.length > 0 &&
		typeof entry.when.equals === 'string'
	) {
		step.when = { equals: entry.when.equals, parameter: entry.when.parameter };
	}
	return step;
}

export function normalizeRecipe(value: unknown, fallbackId: string): RecipeDefinition {
	if (!isRecord(value)) throw new Error(`Invalid recipe: ${fallbackId}`);
	const id = fallbackId;
	if (!recipeIdPattern.test(id)) throw new Error(`Invalid recipe id: ${id}`);
	if (typeof value.name !== 'string' || value.name.length === 0) {
		throw new Error(`Recipe is missing a name: ${id}`);
	}
	if (!Array.isArray(value.steps)) throw new Error(`Recipe is missing steps: ${id}`);
	const steps = value.steps
		.map((step, index) => toStep(step, id, index + 1))
		.filter((step): step is RecipeStepDefinition => step !== undefined);
	if (steps.length !== value.steps.length) throw new Error(`Recipe has invalid steps: ${id}`);
	if (steps.length === 0) throw new Error(`Recipe has no steps: ${id}`);
	return {
		id,
		name: value.name,
		parameters: toParameters(value.parameters),
		steps,
		...(typeof value.description === 'string' ? { description: value.description } : {}),
		...(value.metadataOnly === true ? { metadataOnly: true } : {}),
		...(isSystemRecipeId(id) ? { system: true } : {}),
	} satisfies RecipeDefinition;
}

export function recipeFilePayload(recipe: RecipeDefinition): Omit<
	RecipeDefinition,
	'id' | 'steps' | 'system'
> & {
	steps: (Omit<RecipeStepDefinition, 'id'> & { id?: string })[];
} {
	return {
		...(recipe.description !== undefined ? { description: recipe.description } : {}),
		...(recipe.metadataOnly === true ? { metadataOnly: true } : {}),
		name: recipe.name,
		parameters: recipe.parameters,
		steps: recipe.steps.map((step, index) => {
			const { id, ...payload } = step;
			return id === `${recipe.id}_step_${index + 1}` ? payload : { ...payload, id };
		}),
	};
}
