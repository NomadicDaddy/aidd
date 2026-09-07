import { describe, expect, test } from 'bun:test';

import type { RecipeStepType } from '../../frontend/src/api/types.ts';

import {
	applySkillExplainer,
	autoFixPolicyExplainer,
	continuePolicyExplainer,
	recipeMetadataOnlyExplainer,
	recipeParameterCountExplainer,
	recipeStepCountExplainer,
	recipeStepTypeExplainer,
	recipeSystemExplainer,
	recipeTypeExplainer,
	retriesExplainer,
	reviewSkillExplainer,
	stopPolicyExplainer,
} from '../../frontend/src/pages/recipes/recipe-badge-explainers.ts';

const stepTypes: RecipeStepType[] = ['aidd-cli', 'recipe-ref', 'shell', 'skill'];

describe('recipe badge explainers', () => {
	test('every recipe type and step type has a non-empty explainer', () => {
		expect(recipeTypeExplainer.pipeline.length).toBeGreaterThan(0);
		expect(recipeTypeExplainer['single-step'].length).toBeGreaterThan(0);
		for (const stepType of stepTypes) {
			expect(recipeStepTypeExplainer[stepType].length).toBeGreaterThan(0);
		}
	});

	test('static count explainers are non-empty', () => {
		expect(recipeStepCountExplainer.length).toBeGreaterThan(0);
		expect(recipeParameterCountExplainer.length).toBeGreaterThan(0);
		expect(recipeSystemExplainer.length).toBeGreaterThan(0);
		expect(recipeMetadataOnlyExplainer.length).toBeGreaterThan(0);
	});

	test('metadata-only explainer scopes writes to .aidd/', () => {
		expect(recipeMetadataOnlyExplainer).toContain('.aidd/');
	});

	test('policy explainers pluralize the step count', () => {
		expect(stopPolicyExplainer(1)).toContain('1 step');
		expect(stopPolicyExplainer(2)).toContain('2 steps');
		expect(continuePolicyExplainer(1)).toContain('1 step');
		expect(continuePolicyExplainer(3)).toContain('3 steps');
		expect(autoFixPolicyExplainer(1)).toContain('1 step');
		expect(autoFixPolicyExplainer(4)).toContain('4 steps');
		expect(reviewSkillExplainer(1)).toContain('1 step');
		expect(reviewSkillExplainer(2)).toContain('2 steps');
		expect(applySkillExplainer(1)).toContain('1 step');
		expect(applySkillExplainer(5)).toContain('5 steps');
	});

	test('retries explainer states the total', () => {
		expect(retriesExplainer(6)).toBe('Total retry attempts configured across all steps: 6.');
	});
});
