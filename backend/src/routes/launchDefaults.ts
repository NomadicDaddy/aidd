import { resolveEffectiveLaunchTarget } from 'aidd-shared/plan/launch-target';
import { Elysia, t } from 'elysia';

import type { WebContext } from '../context.ts';

import { resolveLaunchConfig } from '../services/run/launchConfig.ts';

// User-launchable modes plus the recipe-step directive mode; director cycles
// resolve from the director profile, not this endpoint.
const modeQuery = t.Union([
	t.Literal('audit'),
	t.Literal('coding'),
	t.Literal('directive'),
	t.Literal('interview'),
	t.Literal('todo'),
	t.Literal('triumvirate'),
	t.Literal('validate'),
]);

// Reports the backend/model/effort a launch would resolve to right now — user config
// overlaid with the target project's .aidd/aidd.config.json, the same resolution
// launchRun applies — so launch surfaces can display the true defaults before starting.
export function createLaunchDefaultsRoutes(context: WebContext) {
	return new Elysia({ prefix: '/api/v1/launch-defaults' }).get(
		'/',
		async ({ query }) => {
			// resolveProjectPath enforces allowedRoots — load-bearing here because this
			// endpoint reads a config file under the supplied path.
			const projectDir = query.projectDir
				? await context.projectService.resolveProjectPath(query.projectDir)
				: null;
			const { config, projectConfigApplied } = await resolveLaunchConfig({
				base: context.config,
				projectDir,
			});
			const effective = resolveEffectiveLaunchTarget(config, query.mode ?? 'coding');
			const triumvirate = {
				exec: {
					backend: config.triumvirate?.execCli ?? null,
					model: config.triumvirate?.execModel ?? null,
				},
				overseer: {
					backend: config.triumvirate?.overseerCli ?? null,
					model: config.triumvirate?.overseerModel ?? null,
				},
				secondary: {
					backend: config.triumvirate?.secondaryCli ?? null,
					model: config.triumvirate?.secondaryModel ?? null,
				},
			};
			return { effective, projectConfigApplied, triumvirate };
		},
		{
			query: t.Object({
				mode: t.Optional(modeQuery),
				projectDir: t.Optional(t.String()),
			}),
		}
	);
}
