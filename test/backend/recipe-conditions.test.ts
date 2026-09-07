import { describe, expect, test } from 'bun:test';

import { shouldRunRecipeStep } from '../../backend/src/services/pipeline/stepExecutor.ts';
import { normalizeRecipe } from '../../backend/src/services/recipeNormalize.ts';

describe('recipe step conditions', () => {
	test('normalizes an exact parameter condition and skips unless it matches', () => {
		const recipe = normalizeRecipe(
			{
				name: 'conditional recipe',
				parameters: [],
				steps: [
					{
						configJson: { command: 'bun run build' },
						name: 'Build',
						stepType: 'shell',
						when: { equals: 'false', parameter: 'stopBeforeImplementation' },
					},
				],
			},
			'conditional-recipe',
		);
		const step = recipe.steps[0];
		expect(step?.when).toEqual({
			equals: 'false',
			parameter: 'stopBeforeImplementation',
		});
		if (!step) throw new Error('Expected normalized recipe step');
		expect(shouldRunRecipeStep(step, { stopBeforeImplementation: 'true' })).toBe(false);
		expect(shouldRunRecipeStep(step, { stopBeforeImplementation: 'false' })).toBe(true);
	});
});
