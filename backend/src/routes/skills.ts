import { MATURITY_INVOCATIONS } from 'aidd-shared/metadata/maturity';
import { Elysia, t } from 'elysia';

import type { WebContext } from '../context.ts';

import { HttpError } from '../services/errors.ts';
import { SkillLaunchService } from '../services/skillLaunchService.ts';

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
			recipe.steps.some(
				(step) => step.stepType === 'skill' && step.configJson.skillId === id,
			),
		)
		.map((recipe) => `recipe:${recipe.id}`);
	const maturityReferences = Object.entries(MATURITY_INVOCATIONS)
		.filter(([, invocation]) => invocation.kind === 'skill' && invocation.skillId === id)
		.map(([slug]) => `maturity:${slug}`);
	return [...recipeReferences, ...maturityReferences];
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
			{ body: importBody },
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
			{ body: importBody },
		)
		.delete(
			'/imports/:id',
			async ({ params }) => {
				if (await context.scheduledTaskService?.referencesTarget('skill', params.id)) {
					throw new HttpError(
						`Skill ${params.id} is referenced by a non-archived scheduled task.`,
						409,
					);
				}
				await context.skillService.deleteImportedSkill(
					params.id,
					await referencesForSkill(context, params.id),
				);
				return { deleted: true };
			},
			{ params: skillIdParams },
		)
		.get(
			'/:id',
			async ({ params }) => ({
				skill: await context.skillService.readSkill(params.id),
			}),
			{ params: skillIdParams },
		)
		.post(
			'/:id/run',
			async ({ body, params }) => ({
				session: await (
					context.skillLaunchService ??
					new SkillLaunchService(context.pipelineService, context.skillService)
				).launchSkill({
					...body,
					initiator: 'operator',
					skillId: params.id,
				}),
			}),
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
			},
		);
}
