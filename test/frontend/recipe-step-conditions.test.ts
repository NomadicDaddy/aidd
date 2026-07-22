import { describe, expect, test } from 'bun:test';

import type { RecipeDefinition } from '../../frontend/src/api/types.ts';
import {
	collectStepErrors,
	toDrafts,
	toStep,
} from '../../frontend/src/pages/recipes/recipe-steps.ts';

describe('recipe step condition editing', () => {
	test('preserves a parameter condition through the editor draft', () => {
		const recipe: RecipeDefinition = {
			id: 'conditional',
			name: 'Conditional',
			parameters: [],
			steps: [
				{
					configJson: { command: 'bun run build' },
					id: 'build',
					name: 'Build',
					stepType: 'shell',
					when: { equals: 'false', parameter: 'stopBeforeImplementation' },
				},
			],
		};
		const draft = toDrafts(recipe)[0];
		expect(draft).toBeDefined();
		if (!draft) throw new Error('Expected recipe step draft');
		expect(collectStepErrors(draft).when).toBeNull();
		expect(toStep(draft).when).toEqual(recipe.steps[0]?.when);
	});

	test('requires both halves of a condition', () => {
		const draft = toDrafts({
			id: 'unconditional',
			name: 'Unconditional',
			parameters: [],
			steps: [
				{
					configJson: {},
					id: 'step',
					name: 'Step',
					stepType: 'shell',
				},
			],
		})[0];
		expect(draft).toBeDefined();
		if (!draft) throw new Error('Expected recipe step draft');
		draft.whenParameter = 'stopBeforeImplementation';
		expect(collectStepErrors(draft).when).toBe(
			'Condition parameter and expected value must both be set'
		);
	});
});
