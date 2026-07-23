import { describe, expect, test } from 'bun:test';

import type { RecipeDefinition } from '../../frontend/src/api/types.ts';

import { getRecipePolicySummary } from '../../frontend/src/pages/recipes/recipe-policy.ts';

describe('recipe card policy metadata', () => {
	test('summarizes failure behavior, effective retries, and skill intent', () => {
		const recipe: RecipeDefinition = {
			id: 'mixed-policies',
			name: 'Mixed policies',
			parameters: [],
			steps: [
				{
					configJson: {},
					id: 'stop',
					name: 'Stop',
					retryCount: 2,
					stepType: 'shell',
				},
				{
					configJson: { executionIntent: 'review-only', skillId: 'review' },
					id: 'review',
					name: 'Review',
					onFailure: 'continue',
					stepType: 'skill',
				},
				{
					configJson: { executionIntent: 'apply-changes', skillId: 'apply' },
					id: 'apply-default-retry',
					name: 'Apply with default retry',
					onFailure: 'auto-fix',
					stepType: 'skill',
				},
				{
					configJson: { executionIntent: 'apply-changes', skillId: 'apply-again' },
					id: 'apply-explicit-retries',
					name: 'Apply with explicit retries',
					onFailure: 'auto-fix',
					retryCount: 3,
					stepType: 'skill',
				},
			],
		};

		expect(getRecipePolicySummary(recipe)).toEqual({
			applySkillSteps: 2,
			autoFixSteps: 2,
			continueSteps: 1,
			retries: 6,
			reviewSkillSteps: 1,
			stopSteps: 1,
		});
	});
});
