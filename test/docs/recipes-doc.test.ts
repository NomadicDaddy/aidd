import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { describe, expect, test } from 'bun:test';

// Drift check for docs/guides/recipes.md. The doc is hand-curated (it carries prose
// that isn't derivable from the recipe JSON: the deploy note, parameter-default
// explanations, the commentary under each step list). We therefore don't regenerate it —
// we assert the machine-derivable facts that silently go stale: which recipes exist, each
// recipe's name, step count, parameter names, metadata-only flag, the exact description
// text, and each step's type plus the prompt excerpt it quotes. Step-list entries quote
// prompts verbatim (truncated with "..."), never paraphrased, so the excerpt is checked
// as a literal prefix of the recipe's prompt. Surrounding prose is left untouched.

const repoRoot = join(import.meta.dir, '..', '..');
const recipesDir = join(repoRoot, 'recipes');
const docPath = join(repoRoot, 'docs', 'guides', 'recipes.md');

interface RecipeStep {
	configJson?: { prompt?: string };
	stepType: string;
}

interface RecipeJson {
	description?: string;
	metadataOnly?: boolean;
	name: string;
	parameters: { name: string }[];
	steps: RecipeStep[];
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

interface DocStep {
	// Everything after "N. `stepType` - ", i.e. the step name plus its parenthetical.
	detail: string;
	stepType: string;
}

interface RecipeSection {
	description: string;
	metadataOnly: boolean;
	steps: DocStep[];
}

const STEP_LINE = /^\d+\. `([^`]+)` - (.+)$/;

function parseSectionSteps(block: string): DocStep[] {
	const steps: DocStep[] = [];
	for (const line of block.split('\n')) {
		const match = STEP_LINE.exec(line);
		if (match) steps.push({ detail: match[2]!, stepType: match[1]! });
	}
	return steps;
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
			steps: parseSectionSteps(rest),
		});
	}
	return sections;
}

// The doc renders a step's prompt as a truncated excerpt inside the parenthetical:
// "(maxIterations: 1; prompt: <excerpt> ...)", optionally trailed by "; retryCount: 1".
// Prompts themselves contain "(" and ")", so the parenthetical is closed by the last
// ")" on the line — anything after it is hand-written prose, never part of the excerpt.
function extractPromptExcerpt(detail: string): string | undefined {
	const marker = detail.indexOf('prompt: ');
	if (marker === -1) return undefined;
	const close = detail.lastIndexOf(')');
	if (close === -1 || close < marker) return undefined;
	const excerpt = detail.slice(marker + 'prompt: '.length, close);
	// Markdown-escaped punctuation (e.g. "\*") is literal in the recipe JSON.
	return excerpt
		.replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1')
		.replace(/\s*\.\.\.$/, '')
		.trimEnd();
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
				recipe.metadataOnly === true,
			);
		}
	});

	test('each step-list entry matches its step type and quoted prompt excerpt', async () => {
		const recipes = await loadRecipes();
		const sections = parseRecipeSections(await readFile(docPath, 'utf8'));
		let checkedExcerpts = 0;
		for (const [id, recipe] of recipes) {
			const docSteps = sections.get(id)?.steps ?? [];
			expect(docSteps.length, `step-list length for ${id}`).toBe(recipe.steps.length);
			for (const [index, step] of recipe.steps.entries()) {
				const docStep = docSteps[index]!;
				expect(docStep.stepType, `step ${index + 1} type for ${id}`).toBe(step.stepType);
				const prompt = step.configJson?.prompt;
				if (prompt === undefined) continue;
				const excerpt = extractPromptExcerpt(docStep.detail);
				expect(excerpt, `step ${index + 1} of ${id} should quote its prompt`).toBeDefined();
				// Prefix match: the doc truncates long prompts, so it must be a leading slice.
				expect(
					prompt.startsWith(excerpt!),
					`step ${index + 1} of ${id} quotes a stale prompt excerpt.\n  doc:    ${excerpt}\n  recipe: ${prompt.slice(0, excerpt!.length)}`,
				).toBe(true);
				checkedExcerpts += 1;
			}
		}
		// Guard the guard: a parser that silently stopped matching would vacuously pass.
		expect(checkedExcerpts).toBeGreaterThan(20);
	});
});
