import { SAFE_BACKEND_ARG_PATTERN } from 'aidd-shared/backends/safe-arg';
import { Elysia, t } from 'elysia';

import type { WebContext } from '../context.ts';

import { HttpError } from '../services/errors.ts';
import { backendNameBody } from './schemas/backend.ts';

const safeModelArg = t.String({ pattern: SAFE_BACKEND_ARG_PATTERN });

const recipeConfigBody = t.Record(t.String(), t.Unknown());

const recipeStepBody = t.Object({
	configJson: recipeConfigBody,
	id: t.Optional(t.String()),
	name: t.String(),
	onFailure: t.Optional(
		t.Union([t.Literal('auto-fix'), t.Literal('continue'), t.Literal('stop')]),
	),
	postHookJson: t.Optional(recipeConfigBody),
	preHookJson: t.Optional(recipeConfigBody),
	retryCount: t.Optional(t.Number()),
	stepType: t.Union([
		t.Literal('aidd-cli'),
		t.Literal('skill'),
		t.Literal('recipe-ref'),
		t.Literal('shell'),
	]),
	when: t.Optional(
		t.Object({
			equals: t.String(),
			parameter: t.String({ minLength: 1 }),
		}),
	),
});

const recipeBody = t.Object({
	description: t.Optional(t.String()),
	id: t.Optional(t.String()),
	metadataOnly: t.Optional(t.Boolean()),
	name: t.String(),
	parameters: t.Optional(
		t.Array(
			t.Object({
				defaultValue: t.Optional(t.String()),
				description: t.Optional(t.String()),
				name: t.String(),
			}),
		),
	),
	steps: t.Array(recipeStepBody),
});

export function createRecipesRoutes(context: WebContext) {
	return new Elysia({ prefix: '/api/v1/recipes' })
		.get('/', async () => ({ recipes: await context.recipeService.listRecipes() }))
		.post('/reload', async () => ({ recipes: await context.recipeService.reloadRecipes() }))
		.get(
			'/:id',
			async ({ params }) => ({
				recipe: await context.recipeService.readRecipe(params.id),
			}),
			{ params: t.Object({ id: t.String() }) },
		)
		.put(
			'/:id',
			async ({ body, params }) => ({
				recipe: await context.recipeService.writeRecipePayload(params.id, body),
			}),
			{ body: recipeBody, params: t.Object({ id: t.String() }) },
		)
		.delete(
			'/:id',
			async ({ params }) => {
				if (await context.scheduledTaskService?.referencesTarget('recipe', params.id)) {
					throw new HttpError(
						`Recipe ${params.id} is referenced by a non-archived scheduled task.`,
						409,
					);
				}
				await context.recipeService.deleteRecipe(params.id);
				return { ok: true };
			},
			{ params: t.Object({ id: t.String() }) },
		)
		.post(
			'/:id/reload',
			async ({ params }) => ({
				recipe: await context.recipeService.reloadRecipe(params.id),
			}),
			{ params: t.Object({ id: t.String() }) },
		)
		.post(
			'/:id/launch',
			async ({ body, params }) => ({
				session: await context.pipelineService.launchRecipe({
					initiator: 'operator',
					launchTarget: {
						backend: body.backend,
						model: body.model,
						reasoningEffort: body.reasoningEffort,
					},
					parameters: body.parameters,
					projectDir: body.projectDir,
					recipeId: params.id,
				}),
			}),
			{
				body: t.Object({
					// Session-level launch override; wins over per-step backend/model config.
					backend: t.Optional(backendNameBody),
					model: t.Optional(safeModelArg),
					parameters: t.Optional(t.Record(t.String(), t.String())),
					projectDir: t.String(),
					reasoningEffort: t.Optional(safeModelArg),
				}),
				params: t.Object({ id: t.String() }),
			},
		);
}
