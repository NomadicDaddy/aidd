import { MATURITY_INVOCATIONS } from 'aidd-shared/metadata/maturity';
import { normalizeBackendName } from 'aidd-shared/plan/types';
import { isSkillExecutionIntent } from 'aidd-shared/skill-execution-intent';
import { Elysia, t } from 'elysia';

import type { WebContext } from '../context.ts';

import { HttpError } from '../services/errors.ts';
import { SKILL_RECIPE_PREFIX } from '../services/recipeService.ts';

const skillIdParams = t.Object({ id: t.String({ maxLength: 64, minLength: 1 }) });
const skillCategory = t.Union([
	t.Literal('audit-remediation'),
	t.Literal('general'),
	t.Literal('metadata'),
	t.Literal('recipe-maturity'),
	t.Literal('runtime'),
	t.Literal('spernakit-fleet'),
]);
const importBody = t.Object({
	category: t.Optional(skillCategory),
	replace: t.Optional(t.Boolean()),
	sourcePath: t.String({ minLength: 1 }),
});

async function referencesForSkill(context: WebContext, id: string): Promise<string[]> {
	const recipes = await context.recipeService.listRecipes();
	const recipeReferences = recipes
		.filter((recipe) =>
			recipe.steps.some((step) => step.stepType === 'skill' && step.configJson.skillId === id)
		)
		.map((recipe) => `recipe:${recipe.id}`);
	const maturityReferences = Object.entries(MATURITY_INVOCATIONS)
		.filter(([, invocation]) => invocation.kind === 'skill' && invocation.skillId === id)
		.map(([slug]) => `maturity:${slug}`);
	return [...recipeReferences, ...maturityReferences];
}

function parseBackend(value: string | undefined) {
	if (value === undefined) return undefined;
	const backend = normalizeBackendName(value);
	if (!backend) throw new HttpError(`Invalid backend: ${value}`, 400);
	return backend;
}

export function createSkillsRoutes(context: WebContext) {
	return new Elysia({ prefix: '/api/v1/skills' })
		.get('/', async () => ({ skills: await context.skillService.listSkills() }))
		.post(
			'/imports/preview',
			async ({ body }) => ({
				preview: await context.skillService.previewImport({
					...(body.category ? { category: body.category } : {}),
					sourcePath: body.sourcePath,
				}),
			}),
			{ body: importBody }
		)
		.post(
			'/imports',
			async ({ body }) => ({
				skill: await context.skillService.importSkill({
					...(body.category ? { category: body.category } : {}),
					...(body.replace === true ? { replace: true } : {}),
					sourcePath: body.sourcePath,
				}),
			}),
			{ body: importBody }
		)
		.delete(
			'/imports/:id',
			async ({ params }) => {
				await context.skillService.deleteImportedSkill(
					params.id,
					await referencesForSkill(context, params.id)
				);
				return { deleted: true };
			},
			{ params: skillIdParams }
		)
		.get(
			'/:id',
			async ({ params }) => ({
				skill: await context.skillService.readSkill(params.id),
			}),
			{ params: skillIdParams }
		)
		.post(
			'/:id/run',
			async ({ body, params }) => {
				if (!isSkillExecutionIntent(body.executionIntent)) {
					throw new HttpError(
						'executionIntent must be either "review-only" or "apply-changes"',
						400
					);
				}
				const backend = parseBackend(body.backend);
				// Surface catalog 400/404s before a pipeline session is created.
				await context.skillService.readSkill(params.id);
				const session = await context.pipelineService.launchRecipe({
					// Session-level override is the canonical carrier; the synthetic recipe
					// parameters below stay populated so persisted sessions from before the
					// launchTarget columns still resume with the same values.
					launchTarget: {
						backend,
						model: body.model,
						reasoningEffort: body.reasoningEffort,
					},
					parameters: {
						args: body.args ?? '',
						backend: backend ?? '',
						executionIntent: body.executionIntent,
						model: body.model ?? '',
					},
					projectDir: body.projectDir,
					recipeId: `${SKILL_RECIPE_PREFIX}${params.id}`,
				});
				return { session };
			},
			{
				body: t.Object({
					args: t.Optional(t.String()),
					backend: t.Optional(t.String()),
					executionIntent: t.Optional(t.String()),
					model: t.Optional(t.String()),
					projectDir: t.String(),
					reasoningEffort: t.Optional(t.String()),
				}),
				params: skillIdParams,
			}
		);
}
