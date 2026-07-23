import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { normalizeRecipe } from '../../backend/src/services/recipeNormalize.ts';

const recipesDir = join(import.meta.dir, '..', '..', 'recipes');

interface RecipeFile {
	name: string;
	parameters: { defaultValue?: string; description: string; name: string }[];
	steps: { configJson: Record<string, unknown>; id?: string; name: string; stepType: string }[];
}

async function readRecipes(): Promise<Map<string, RecipeFile>> {
	const recipes = new Map<string, RecipeFile>();
	for (const file of (await readdir(recipesDir)).filter((entry) => entry.endsWith('.json'))) {
		const raw = await readFile(join(recipesDir, file), 'utf8');
		recipes.set(basename(file, '.json'), JSON.parse(raw) as RecipeFile);
	}
	return recipes;
}

describe('bundled recipe consistency', () => {
	test('uses normalized positional step ids without persisting redundant id fields', async () => {
		const recipes = await readRecipes();
		for (const [id, recipe] of recipes) {
			for (const [index, step] of recipe.steps.entries()) {
				expect(step.id, `${id} step ${index + 1} persists a redundant id`).toBeUndefined();
			}
			const normalized = normalizeRecipe(recipe, id);
			expect(normalized.steps.map((step) => step.id)).toEqual(
				recipe.steps.map((_, index) => `${id}_step_${index + 1}`)
			);
		}
	});

	test('names the review workflows accurately and keeps remediation category-complete', async () => {
		const recipes = await readRecipes();
		expect(recipes.get('coding-review-remediate-document-changes')?.name).toBe(
			'coding, deep review, remediation, and change documentation'
		);
		expect(recipes.get('coding-spirit-document-changes')?.name).toBe(
			'coding, spirit review, remediation, and change documentation'
		);
		expect(recipes.get('coding-spirit-coderabbit-document-changes')?.name).toBe(
			'coding, spirit and CodeRabbit reviews, remediation, and change documentation'
		);

		for (const id of [
			'coding-review-remediate-document-changes',
			'coding-spirit-document-changes',
			'coding-spirit-coderabbit-document-changes',
		]) {
			const remediationSteps =
				recipes.get(id)?.steps.filter((step) => step.name.startsWith('Remediate ')) ?? [];
			expect(remediationSteps.length, `${id} remediation steps`).toBeGreaterThan(0);
			for (const step of remediationSteps) {
				const prompt = String(step.configJson.prompt ?? '');
				expect(prompt).toContain('every confirmed finding that is reasonable, applicable');
				expect(prompt).toContain('do not restrict remediation to a fixed category list');
				expect(prompt).toContain('Do not act on false positives');
				expect(prompt).toContain('requires user input');
			}
		}
	});

	test('forwards the optional feature target through every coding workflow', async () => {
		const recipes = await readRecipes();
		for (const id of [
			'coding',
			'coding-review-remediate-document-changes',
			'coding-spirit-document-changes',
			'coding-spirit-coderabbit-document-changes',
		]) {
			const recipe = recipes.get(id);
			const feature = recipe?.parameters.find((parameter) => parameter.name === 'feature');
			expect(feature?.defaultValue, `${id} feature default`).toBe('');
			expect(feature?.description, `${id} feature description`).toBe(
				'Optional feature directory or id to complete'
			);
			expect(recipe?.steps[0]?.configJson.feature, `${id} coding feature target`).toBe(
				'{feature}'
			);
		}
	});
});
