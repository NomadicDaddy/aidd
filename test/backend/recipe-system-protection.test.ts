import { describe, expect, test } from 'bun:test';

import { RecipeService } from '../../backend/src/services/recipeService.ts';
import { testTempDir } from '../_helpers/temp.ts';

const codingRecipe = {
	id: 'coding',
	metadataOnly: true,
	name: 'coding',
	parameters: [],
	steps: [
		{
			configJson: {},
			id: 'coding_step_1',
			name: 'Run coding',
			stepType: 'aidd-cli' as const,
		},
	],
};

describe('system recipe protection', () => {
	test('classifies system recipes without persisting the computed marker', async () => {
		const rootDir = await testTempDir('aidd-system-recipe-classification-');
		const service = new RecipeService(rootDir);

		const written = await service.writeRecipe(codingRecipe);
		const read = await service.readRecipe('coding');
		const raw = await Bun.file(`${rootDir}/recipes/coding.json`).json();

		expect(written.system).toBe(true);
		expect(read.system).toBe(true);
		expect(read.metadataOnly).toBe(true);
		expect(raw).not.toHaveProperty('system');
		expect(raw.metadataOnly).toBe(true);
	});

	test('rejects renaming or deleting a system recipe', async () => {
		const rootDir = await testTempDir('aidd-system-recipe-protection-');
		const service = new RecipeService(rootDir);
		await service.writeRecipe(codingRecipe);

		await expect(
			service.writeRecipe({ ...codingRecipe, name: 'renamed coding' })
		).rejects.toMatchObject({
			status: 409,
		});
		await expect(service.deleteRecipe('coding')).rejects.toMatchObject({ status: 409 });
		expect((await service.readRecipe('coding')).name).toBe('coding');
	});

	test('keeps custom recipes editable and deletable', async () => {
		const rootDir = await testTempDir('aidd-custom-recipe-mutations-');
		const service = new RecipeService(rootDir);
		await service.writeRecipe({ ...codingRecipe, id: 'custom', name: 'Custom' });

		const updated = await service.writeRecipe({
			...codingRecipe,
			id: 'custom',
			name: 'Renamed custom',
		});
		expect(updated.system).toBeUndefined();
		expect(updated.name).toBe('Renamed custom');

		await service.deleteRecipe('custom');
		await expect(service.readRecipe('custom')).rejects.toMatchObject({ status: 404 });
	});
});
