import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import type { RecipeDefinition } from '../../backend/src/types.ts';

import { RecipeService } from '../../backend/src/services/recipeService.ts';
import { testTempDir } from '../_helpers/temp.ts';

function recipe(id: string, name: string): RecipeDefinition {
	return {
		id,
		name,
		parameters: [],
		steps: [
			{
				configJson: {},
				id: `${id}_step_1`,
				name: `Run ${name}`,
				stepType: 'aidd-cli',
			},
		],
	};
}

describe('recipe name uniqueness', () => {
	test('rejects a write that reuses another recipe name', async () => {
		const rootDir = await testTempDir('aidd-recipe-name-write-');
		const service = new RecipeService(rootDir);
		await service.writeRecipe(recipe('first', 'shared name'));

		await expect(service.writeRecipe(recipe('second', 'shared name'))).rejects.toMatchObject({
			message: 'Duplicate recipe name "shared name" is used by first and second',
			status: 409,
		});
		await expect(service.readRecipe('second')).rejects.toMatchObject({ status: 404 });
	});

	test('rejects duplicate names already present on disk', async () => {
		const rootDir = await testTempDir('aidd-recipe-name-catalog-');
		const recipesDir = join(rootDir, 'recipes');
		await mkdir(recipesDir, { recursive: true });
		await Promise.all([
			writeFile(join(recipesDir, 'first.json'), JSON.stringify(recipe('first', 'duplicate'))),
			writeFile(
				join(recipesDir, 'second.json'),
				JSON.stringify(recipe('second', 'duplicate')),
			),
		]);

		await expect(new RecipeService(rootDir).listRecipes()).rejects.toMatchObject({
			message: 'Duplicate recipe name "duplicate" is used by first and second',
			status: 409,
		});
	});

	test('resolves an exact id before a different recipe with that display name', async () => {
		const rootDir = await testTempDir('aidd-recipe-name-resolution-');
		const service = new RecipeService(rootDir);
		await service.writeRecipe(recipe('canonical', 'Canonical workflow'));
		await service.writeRecipe(recipe('shadow', 'canonical'));

		expect((await service.findRecipeByName('canonical'))?.id).toBe('canonical');
	});
});
