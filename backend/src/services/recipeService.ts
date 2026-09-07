import { printJson } from 'aidd-shared/metadata/json-format';
import { readSkillDefinition, type SkillDefinition } from 'aidd-shared/skills/catalog';
import { isSystemRecipeId, systemRecipeName } from 'aidd-shared/system-recipes';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { RecipeDefinition } from '../types.ts';

import { webLogger } from '../logger.ts';
import { recordDataMovement } from './dataMovementTrace.ts';
import { HttpError } from './errors.ts';
import {
	isEnoent,
	isRecord,
	isValidRecipeId,
	normalizeRecipe,
	recipeFilePayload,
	recipePath,
} from './recipeNormalize.ts';

export class RecipeNotFoundError extends HttpError {
	constructor(message: string) {
		super(message, 404);
		this.name = 'RecipeNotFoundError';
	}
}

/**
 * Reserved id prefix for synthetic one-shot skill recipes. The colon is
 * illegal in on-disk recipe ids (see recipeNormalize), so a synthetic id can
 * never collide with a stored recipe — and because readRecipe re-synthesizes
 * from the prefix, session resume after a web restart works unchanged.
 */
export const SKILL_RECIPE_PREFIX = 'skill:';

function assertUniqueRecipeNames(recipes: RecipeDefinition[]): void {
	const recipeByName = new Map<string, RecipeDefinition>();
	for (const recipe of [...recipes].sort((left, right) => left.id.localeCompare(right.id))) {
		const existing = recipeByName.get(recipe.name);
		if (existing !== undefined) {
			throw new HttpError(
				`Duplicate recipe name "${recipe.name}" is used by ${existing.id} and ${recipe.id}`,
				409,
			);
		}
		recipeByName.set(recipe.name, recipe);
	}
}

function referencedRecipeNames(recipe: RecipeDefinition): string[] {
	const references: string[] = [];
	for (const step of recipe.steps) {
		if (step.stepType !== 'recipe-ref') continue;
		const recipeName = step.configJson.recipeName;
		if (typeof recipeName === 'string' && recipeName.length > 0) references.push(recipeName);
	}
	return references;
}

function resolveRecipeReference(
	recipes: RecipeDefinition[],
	reference: string,
): RecipeDefinition | undefined {
	return (
		recipes.find((recipe) => recipe.id === reference) ??
		recipes.find((recipe) => recipe.name === reference)
	);
}

function assertNoRecipeCycle(recipes: RecipeDefinition[], savedRecipeId: string): void {
	const savedRecipe = recipes.find((recipe) => recipe.id === savedRecipeId);
	if (savedRecipe === undefined) return;
	const path: string[] = [];
	const visited = new Set<string>();

	function visit(recipe: RecipeDefinition): void {
		path.push(recipe.id);
		for (const reference of referencedRecipeNames(recipe)) {
			const child = resolveRecipeReference(recipes, reference);
			if (child === undefined) continue;
			const cycleStart = path.indexOf(child.id);
			if (cycleStart >= 0) {
				throw new HttpError(
					`Recipe cycle detected: ${[...path.slice(cycleStart), child.id].join(' -> ')}`,
					409,
				);
			}
			if (!visited.has(child.id)) visit(child);
		}
		path.pop();
		visited.add(recipe.id);
	}

	visit(savedRecipe);
}

export class RecipeService {
	private readonly dataDir: string;
	private readonly rootDir: string;

	constructor(rootDir: string, dataDir = join(rootDir, 'data')) {
		this.dataDir = dataDir;
		this.rootDir = rootDir;
	}

	async deleteRecipe(id: string): Promise<void> {
		if (isSystemRecipeId(id)) {
			throw new HttpError(`System recipe cannot be deleted: ${id}`, 409);
		}
		await rm(recipePath(this.rootDir, id), { force: true });
		recordDataMovement({
			category: 'file',
			operation: 'recipe.delete',
			status: 'success',
			summary: { recipeId: id },
			target: recipePath(this.rootDir, id),
		});
	}

	async findRecipeByName(name: string): Promise<RecipeDefinition | undefined> {
		return resolveRecipeReference(await this.listRecipes(), name);
	}

	async listRecipes(): Promise<RecipeDefinition[]> {
		const recipesDir = join(this.rootDir, 'recipes');
		let entries: string[];
		try {
			entries = await readdir(recipesDir);
		} catch (err) {
			if (isEnoent(err)) return [];
			throw err;
		}
		const recipes: RecipeDefinition[] = [];
		for (const entry of entries.filter((name) => name.endsWith('.json'))) {
			const filePath = join(recipesDir, entry);
			try {
				const parsed = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
				recipes.push(normalizeRecipe(parsed, basename(entry, '.json')));
			} catch (err) {
				webLogger.warn(
					{ err, path: filePath },
					'recipeService.listRecipes: skipping unreadable or invalid recipe file',
				);
			}
		}
		assertUniqueRecipeNames(recipes);
		return recipes.sort((left, right) => left.name.localeCompare(right.name));
	}

	async readRecipe(id: string): Promise<RecipeDefinition> {
		if (id.startsWith(SKILL_RECIPE_PREFIX)) {
			return await this.syntheticSkillRecipe(id.slice(SKILL_RECIPE_PREFIX.length));
		}
		if (!isValidRecipeId(id)) throw new RecipeNotFoundError(`Recipe not found: ${id}`);
		let raw: string;
		try {
			raw = await readFile(recipePath(this.rootDir, id), 'utf8');
		} catch (err) {
			if (isEnoent(err)) throw new RecipeNotFoundError(`Recipe not found: ${id}`);
			throw err;
		}
		const parsed = JSON.parse(raw) as unknown;
		return normalizeRecipe(parsed, id);
	}

	// Builds the in-memory single-step recipe behind `skill:<id>` so one-shot
	// skill runs flow through the same pipeline executor as stored recipes.
	private async syntheticSkillRecipe(skillId: string): Promise<RecipeDefinition> {
		let skill: SkillDefinition;
		try {
			skill = await readSkillDefinition(this.rootDir, skillId, this.dataDir);
		} catch (err) {
			if (
				isEnoent(err) ||
				(err instanceof Error && err.message.startsWith('Invalid skill id:'))
			) {
				throw new RecipeNotFoundError(`Skill not found: ${skillId}`);
			}
			throw err;
		}
		return {
			id: `${SKILL_RECIPE_PREFIX}${skillId}`,
			name: skill.title,
			parameters: [
				{ defaultValue: '', name: 'args' },
				{ defaultValue: '', name: 'backend' },
				{ defaultValue: 'review-only', name: 'executionIntent' },
				{ defaultValue: '', name: 'model' },
			],
			steps: [
				{
					configJson: {
						args: '{args}',
						backend: '{backend}',
						executionIntent: '{executionIntent}',
						model: '{model}',
						skillId,
					},
					id: `skill_${skillId}`,
					name: skill.title,
					stepType: 'skill',
				},
			],
		};
	}

	async reloadRecipe(id: string): Promise<RecipeDefinition> {
		return await this.readRecipe(id);
	}

	async reloadRecipes(): Promise<RecipeDefinition[]> {
		return await this.listRecipes();
	}

	async writeRecipe(recipe: RecipeDefinition): Promise<RecipeDefinition> {
		const normalized = normalizeRecipe(recipe, recipe.id);
		const reservedName = systemRecipeName(normalized.id);
		if (reservedName !== undefined && normalized.name !== reservedName) {
			throw new HttpError(
				`System recipe ${normalized.id} must keep its reserved name: ${reservedName}`,
				409,
			);
		}
		const existingRecipes = (await this.listRecipes()).filter(
			(existing) => existing.id !== normalized.id,
		);
		const recipesWithUpdate = [...existingRecipes, normalized];
		assertUniqueRecipeNames(recipesWithUpdate);
		assertNoRecipeCycle(recipesWithUpdate, normalized.id);
		await mkdir(join(this.rootDir, 'recipes'), { recursive: true });
		await writeFile(
			recipePath(this.rootDir, normalized.id),
			printJson(recipeFilePayload(normalized)),
		);
		recordDataMovement({
			category: 'file',
			operation: 'recipe.write',
			status: 'success',
			summary: { recipeId: normalized.id, steps: normalized.steps.length },
			target: recipePath(this.rootDir, normalized.id),
		});
		return normalized;
	}

	async writeRecipePayload(id: string, payload: unknown): Promise<RecipeDefinition> {
		const normalized = normalizeRecipe(isRecord(payload) ? { ...payload, id } : { id }, id);
		return await this.writeRecipe(normalized);
	}
}
