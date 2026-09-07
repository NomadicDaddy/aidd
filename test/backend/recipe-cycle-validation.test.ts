import { describe, expect, test } from 'bun:test';

import type { RecipeDefinition } from '../../backend/src/types.ts';

import { RecipeService } from '../../backend/src/services/recipeService.ts';
import { testTempDir } from '../_helpers/temp.ts';

function recipe(id: string, name: string, references: string[] = []): RecipeDefinition {
	return {
		id,
		name,
		parameters: [],
		steps:
			references.length === 0
				? [
						{
							configJson: {},
							id: `${id}_step_1`,
							name: `Run ${name}`,
							stepType: 'aidd-cli',
						},
					]
				: references.map((recipeName, index) => ({
						configJson: { recipeName },
						id: `${id}_step_${index + 1}`,
						name: `Run ${recipeName}`,
						stepType: 'recipe-ref' as const,
					})),
	};
}

describe('recipe cycle validation', () => {
	test('rejects a direct self-reference before writing the recipe', async () => {
		const rootDir = await testTempDir('aidd-recipe-cycle-self-');
		const service = new RecipeService(rootDir);

		await expect(
			service.writeRecipe(recipe('self', 'Self recipe', ['self'])),
		).rejects.toMatchObject({
			message: 'Recipe cycle detected: self -> self',
			status: 409,
		});
		await expect(service.readRecipe('self')).rejects.toMatchObject({ status: 404 });
	});

	test('rejects an indirect cycle introduced by editing a referenced recipe', async () => {
		const rootDir = await testTempDir('aidd-recipe-cycle-indirect-');
		const service = new RecipeService(rootDir);
		await service.writeRecipe(recipe('gamma', 'Gamma'));
		await service.writeRecipe(recipe('beta', 'Beta', ['Gamma']));
		await service.writeRecipe(recipe('alpha', 'Alpha', ['Beta']));

		await expect(
			service.writeRecipe(recipe('gamma', 'Gamma', ['Alpha'])),
		).rejects.toMatchObject({
			message: 'Recipe cycle detected: gamma -> alpha -> beta -> gamma',
			status: 409,
		});
		expect((await service.readRecipe('gamma')).steps[0]?.stepType).toBe('aidd-cli');
	});

	test('saves a reference to a different non-cyclic recipe', async () => {
		const rootDir = await testTempDir('aidd-recipe-cycle-valid-');
		const service = new RecipeService(rootDir);
		await service.writeRecipe(recipe('child', 'Child recipe'));

		const saved = await service.writeRecipe(
			recipe('parent', 'Parent recipe', ['Child recipe']),
		);

		expect(saved.steps[0]?.configJson.recipeName).toBe('Child recipe');
		expect((await service.readRecipe('parent')).steps).toEqual(saved.steps);
	});
});
