import type { Dispatch, SetStateAction } from 'react';

import { useState } from 'react';

import type { RecipeDefinition, RecipeParameterDefinition } from '../../../api/types.ts';

import {
	collectStepErrors,
	newStepDraft,
	type StepDraft,
	type StepJsonErrors,
	toDrafts,
} from '../recipe-steps.ts';

/** The editable part of a recipe: everything the form holds except the id. */
export interface RecipeDraftFields {
	description: string;
	name: string;
	parameters: RecipeParameterDefinition[];
	steps: StepDraft[];
}

export interface StepErrorEntry extends StepJsonErrors {
	id: string;
}

export interface RecipeDraft extends RecipeDraftFields {
	hasStepErrors: boolean;
	/** The fields the draft started from, for a dirty check against them. */
	initial: RecipeDraftFields;
	/** Replace every field at once: a loaded, reloaded or cancelled recipe. */
	seed: (fields: RecipeDraftFields) => void;
	setDescription: Dispatch<SetStateAction<string>>;
	setName: (value: string) => void;
	setParameters: Dispatch<SetStateAction<RecipeParameterDefinition[]>>;
	setSteps: Dispatch<SetStateAction<StepDraft[]>>;
	stepErrors: StepErrorEntry[];
	updateStep: (stepId: string, patch: Partial<StepDraft>) => void;
}

/** A new recipe starts with one empty step, so the editor opens on something to fill in. */
export function newRecipeDraft(): RecipeDraftFields {
	return { description: '', name: '', parameters: [], steps: [newStepDraft()] };
}

/** An existing recipe's draft is empty until the recipe loads and seeds it. */
export function emptyRecipeDraft(): RecipeDraftFields {
	return { description: '', name: '', parameters: [], steps: [] };
}

export function recipeDraftFields(recipe: RecipeDefinition): RecipeDraftFields {
	return {
		description: recipe.description ?? '',
		name: recipe.name,
		parameters: recipe.parameters,
		steps: toDrafts(recipe),
	};
}

/**
 * The recipe form's draft, owned once. The create and detail pages each held an identical copy —
 * the same four fields, the same step updater, the same step-error predicate — so a new field meant
 * editing both, and the two predicates were free to drift apart.
 */
export function useRecipeDraft(init: () => RecipeDraftFields): RecipeDraft {
	const [initial] = useState(init);
	const [description, setDescription] = useState(initial.description);
	const [name, setName] = useState(initial.name);
	const [parameters, setParameters] = useState(initial.parameters);
	const [steps, setSteps] = useState(initial.steps);

	function seed(fields: RecipeDraftFields): void {
		setDescription(fields.description);
		setName(fields.name);
		setParameters(fields.parameters);
		setSteps(fields.steps);
	}

	function updateStep(stepId: string, patch: Partial<StepDraft>): void {
		setSteps((current) =>
			current.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
		);
	}

	const stepErrors = steps.map((step, index) => ({
		id: step.id,
		...collectStepErrors(step, index + 1),
	}));
	// A missing step name is not counted here: the save handlers name the step in their own toast.
	const hasStepErrors = stepErrors.some(
		(entry) =>
			entry.configJson ||
			entry.executionIntent ||
			entry.preHookJson ||
			entry.postHookJson ||
			entry.when,
	);

	return {
		description,
		hasStepErrors,
		initial,
		name,
		parameters,
		seed,
		setDescription,
		setName,
		setParameters,
		setSteps,
		stepErrors,
		steps,
		updateStep,
	};
}

/**
 * Why Save would refuse the draft, stated beside the control rather than only in the toast it
 * raises when pressed. The create editor checks its id between these two; the order matches the
 * order the pages' save handlers check in.
 */
export function draftNameBlocker(name: string): null | string {
	return name.trim() ? null : 'Recipe name is required';
}

export function draftStepsBlocker({
	hasStepErrors,
	steps,
}: Pick<RecipeDraft, 'hasStepErrors' | 'steps'>): null | string {
	if (steps.length === 0) return 'Add at least one step';
	if (hasStepErrors) return 'Fix recipe step errors before saving';
	return null;
}
