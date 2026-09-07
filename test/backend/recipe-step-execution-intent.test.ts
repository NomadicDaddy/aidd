import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import type { RecipeDefinition } from '../../frontend/src/api/types.ts';

import { RecipeService } from '../../backend/src/services/recipeService.ts';
import {
	collectStepErrors,
	toDrafts,
	toStep,
} from '../../frontend/src/pages/recipes/recipe-steps.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

function skillRecipe(executionIntent: string): RecipeDefinition {
	return {
		id: 'intent-test',
		name: 'Intent test',
		parameters: [],
		steps: [
			{
				configJson: { executionIntent, skillId: 'tester' },
				id: 'run-tester',
				name: 'Run tester',
				stepType: 'skill',
			},
		],
	};
}

describe('recipe skill execution intent editing', () => {
	test('loads executionIntent into only the structured control', () => {
		const draft = toDrafts(skillRecipe('apply-changes'))[0];
		expect(draft).toBeDefined();
		if (!draft) throw new Error('Expected a skill step draft');

		expect(draft.skillExecutionIntent).toBe('apply-changes');
		expect(JSON.parse(draft.configJson)).toEqual({ skillId: 'tester' });
		expect(collectStepErrors(draft)).toMatchObject({
			configJson: null,
			executionIntent: null,
		});
	});

	test('reports unknown values and conflicting Config JSON instead of overwriting either', () => {
		const unknown = toDrafts(skillRecipe('unexpected'))[0];
		expect(unknown).toBeDefined();
		if (!unknown) throw new Error('Expected an invalid skill step draft');
		expect(unknown.skillExecutionIntent).toBe('unexpected');
		expect(collectStepErrors(unknown).executionIntent).toContain('not recognised');
		expect(() => toStep(unknown)).toThrow('unrecognised executionIntent');

		const conflict = {
			...unknown,
			configJson: '{"executionIntent":"review-only","skillId":"tester"}',
			skillExecutionIntent: 'apply-changes',
		};
		expect(collectStepErrors(conflict).configJson).toContain('conflicts');
		expect(() => toStep(conflict)).toThrow('must not contain executionIntent');

		const duplicate = { ...conflict, skillExecutionIntent: 'review-only' };
		expect(collectStepErrors(duplicate).configJson).toContain('duplicates');
	});

	for (const executionIntent of ['review-only', 'apply-changes'] as const) {
		test(`persists and rereads ${executionIntent} as the authored value`, async () => {
			const rootDir = await testTempDir('aidd-recipe-intent-');
			try {
				const service = new RecipeService(rootDir);
				const draft = toDrafts(skillRecipe(executionIntent))[0];
				if (!draft) throw new Error('Expected a skill step draft');
				const recipe = skillRecipe(executionIntent);
				recipe.steps = [toStep(draft)];

				await service.writeRecipe(recipe);
				const disk = JSON.parse(
					await readFile(join(rootDir, 'recipes', 'intent-test.json'), 'utf8'),
				) as RecipeDefinition;
				const reloaded = await service.readRecipe('intent-test');

				expect(disk.steps[0]?.configJson.executionIntent).toBe(executionIntent);
				expect(reloaded.steps[0]?.configJson.executionIntent).toBe(executionIntent);
			} finally {
				await removeTempTree(rootDir);
			}
		});
	}
});
