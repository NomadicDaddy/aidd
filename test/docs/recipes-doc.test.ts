import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { describe, expect, test } from 'bun:test';

// Drift check for docs/guides/recipes.md. The doc is hand-curated (it carries prose
// that isn't derivable from the recipe JSON: the deploy note, parameter-default
// explanations, paraphrased prompt summaries). We therefore don't regenerate it — we
// assert the machine-derivable facts that silently go stale: which recipes exist, each
// recipe's name, step count, parameter names, metadata-only flag, and — the field that
// actually drifted — the exact description text. Prose is left untouched.

const repoRoot = join(import.meta.dir, '..', '..');
const recipesDir = join(repoRoot, 'recipes');
const docPath = join(repoRoot, 'docs', 'guides', 'recipes.md');

interface RecipeJson {
	description?: string;
	metadataOnly?: boolean;
	name: string;
	parameters: { name: string }[];
	steps: unknown[];
}

async function loadRecipes(): Promise<Map<string, RecipeJson>> {
	const files = (await readdir(recipesDir)).filter((f) => f.endsWith('.json'));
	const recipes = new Map<string, RecipeJson>();
	for (const file of files) {
		const raw = await readFile(join(recipesDir, file), 'utf8');
		recipes.set(basename(file, '.json'), JSON.parse(raw) as RecipeJson);
	}
	return recipes;
}

interface IndexRow {
	name: string;
	parameters: string;
	steps: string;
}

function parseIndexTable(doc: string): Map<string, IndexRow> {
	const rows = new Map<string, IndexRow>();
	const rowPattern = /^\| `([^`]+)` *\| (.+?) *\| (\d+) *\| (.+?) *\|$/gm;
	for (const match of doc.matchAll(rowPattern)) {
		rows.set(match[1]!, { name: match[2]!, parameters: match[4]!, steps: match[3]! });
	}
	return rows;
}

interface RecipeSection {
	description: string;
	metadataOnly: boolean;
}

function parseRecipeSections(doc: string): Map<string, RecipeSection> {
	const sections = new Map<string, RecipeSection>();
	const recipesHeading = doc.indexOf('\n## Recipes\n');
	const body = recipesHeading === -1 ? doc : doc.slice(recipesHeading);
	// Split on level-3 headings; the first chunk is the "## Recipes" preamble.
	const blocks = body.split('\n### ').slice(1);
	for (const block of blocks) {
		const firstNewline = block.indexOf('\n');
		const id = block.slice(0, firstNewline).trim();
		const rest = block.slice(firstNewline + 1);
		const bulletIndex = rest.indexOf('\n- **');
		const description = rest.slice(0, bulletIndex).trim();
		sections.set(id, {
			description,
			metadataOnly: rest.includes('- **Metadata-only:** yes'),
		});
	}
	return sections;
}

function expectedParameters(recipe: RecipeJson): string {
	return recipe.parameters.length === 0
		? 'none'
		: recipe.parameters.map((parameter) => parameter.name).join(', ');
}

describe('docs/guides/recipes.md stays in sync with recipes/*.json', () => {
	test('the index table and per-recipe sections cover exactly the recipe files', async () => {
		const recipes = await loadRecipes();
		const doc = await readFile(docPath, 'utf8');
		const indexIds = [...parseIndexTable(doc).keys()].sort();
		const sectionIds = [...parseRecipeSections(doc).keys()].sort();
		const recipeIds = [...recipes.keys()].sort();
		expect(indexIds).toEqual(recipeIds);
		expect(sectionIds).toEqual(recipeIds);
	});

	test('index rows match each recipe name, step count, and parameter names', async () => {
		const recipes = await loadRecipes();
		const index = parseIndexTable(await readFile(docPath, 'utf8'));
		for (const [id, recipe] of recipes) {
			const row = index.get(id);
			expect(row, `missing index row for ${id}`).toBeDefined();
			expect(row!.name, `name for ${id}`).toBe(recipe.name);
			expect(row!.steps, `step count for ${id}`).toBe(String(recipe.steps.length));
			expect(row!.parameters, `parameters for ${id}`).toBe(expectedParameters(recipe));
		}
	});

	test('each recipe section repeats the recipe JSON description and metadata-only flag', async () => {
		const recipes = await loadRecipes();
		const sections = parseRecipeSections(await readFile(docPath, 'utf8'));
		for (const [id, recipe] of recipes) {
			const section = sections.get(id);
			expect(section, `missing section for ${id}`).toBeDefined();
			expect(section!.description, `description for ${id}`).toBe(recipe.description ?? '');
			expect(section!.metadataOnly, `metadata-only flag for ${id}`).toBe(
				recipe.metadataOnly === true
			);
		}
	});
});
