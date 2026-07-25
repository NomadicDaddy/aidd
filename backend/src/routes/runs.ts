import { Elysia, t } from 'elysia';

import type { WebContext } from '../context.ts';

import { readRunCommits } from '../services/run/commits.ts';
import { backendNameBody } from './schemas/backend.ts';

const safeBackendArg = t.String({ pattern: '^[A-Za-z0-9._:/@-]+$' });

export const launchBody = t.Object({
	auditAll: t.Optional(t.Boolean()),
	auditFindings: t.Optional(t.Boolean()),
	auditFindingsSource: t.Optional(t.String()),
	auditNames: t.Optional(t.Array(t.String())),
	backend: t.Optional(backendNameBody),
	checkArtifacts: t.Optional(t.Boolean()),
	execBackend: t.Optional(backendNameBody),
	execModel: t.Optional(safeBackendArg),
	// Free-form additional CLI flags, tokenized (quote-aware) and appended to the launch
	// argv. Passed as an args array to Bun.spawn — no shell — so there is no injection
	// surface; user-supplied flags win over earlier defaults via the parser's last-wins.
	extraArgs: t.Optional(t.String()),
	feature: t.Optional(t.String()),
	filterBy: t.Optional(t.String()),
	filterValue: t.Optional(t.String()),
	interview: t.Optional(t.Boolean()),
	maxIterations: t.Optional(t.Number()),
	// User-launchable modes only. WebRunMode also includes service-internal modes
	// (director, directive) that are launched by their own routes/services
	// — director via the director cycle, directive via recipe steps and
	// the skill launch path — and are intentionally not accepted on this generic
	// launch route.
	mode: t.Optional(
		t.Union([
			t.Literal('audit'),
			t.Literal('coding'),
			t.Literal('interview'),
			t.Literal('todo'),
			t.Literal('triumvirate'),
			t.Literal('validate'),
		]),
	),
	model: t.Optional(safeBackendArg),
	overseerBackend: t.Optional(backendNameBody),
	overseerModel: t.Optional(safeBackendArg),
	pipelineSessionId: t.Optional(t.String()),
	projectDir: t.String(),
	prompt: t.Optional(t.String()),
	reasoningEffort: t.Optional(safeBackendArg),
	secondaryBackend: t.Optional(backendNameBody),
	secondaryModel: t.Optional(safeBackendArg),
	simulation: t.Optional(t.Boolean()),
	validate: t.Optional(t.Boolean()),
});

// Run routes expose one active-run surface: web-supervised subprocess rows plus CLI heartbeat
// files. Durable completed history is still read from project `.aidd` metadata by project
// endpoints.
export function createRunsRoutes(context: WebContext) {
	return new Elysia({ prefix: '/api/v1/runs' })
		.get(
			'/',
			async ({ query }) => {
				const options = {
					...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
					...(query.limit !== undefined ? { limit: query.limit } : {}),
					...(query.status !== undefined ? { status: query.status } : {}),
					...(query.topLevel !== undefined
						? { topLevel: query.topLevel === 'true' }
						: {}),
				};
				const page = query.projectPath
					? await context.runService.listRunsForProjectPage(query.projectPath, options)
					: await context.runService.listRunsPage(options);
				return { nextCursor: page.nextCursor, runs: page.items };
			},
			{
				query: t.Object({
					cursor: t.Optional(t.String()),
					limit: t.Optional(t.Numeric({ maximum: 200, minimum: 1 })),
					projectPath: t.Optional(t.String()),
					status: t.Optional(
						t.Union([
							t.Literal('completed'),
							t.Literal('failed'),
							t.Literal('killed'),
							t.Literal('running'),
							t.Literal('stopped'),
						]),
					),
					// Query strings arrive as text, so accept literal 'true'/'false' rather
					// than relying on t.Boolean() coercion for query params.
					topLevel: t.Optional(t.Union([t.Literal('true'), t.Literal('false')])),
				}),
			},
		)
		.get(
			'/:id',
			async ({ params }) => {
				const run = await context.runService.getRunRecord(params.id);
				if (!run) return { run: null };
				return { run };
			},
			{ params: t.Object({ id: t.String() }) },
		)
		.get('/:id/output', async ({ params }) => await context.runService.readOutput(params.id), {
			params: t.Object({ id: t.String() }),
		})
		.get(
			'/:id/commits',
			async ({ params }) => {
				const run = await context.runService.getRunRecord(params.id);
				return await readRunCommits(run, params.id);
			},
			{ params: t.Object({ id: t.String() }) },
		)
		.post(
			'/',
			async ({ body }) => {
				const run = await context.runService.launchRun(body);
				// Direct runs (not launched via skill/recipe) record telemetry
				// with resourceType='run' so they appear on the telemetry dashboard.
				const mode = body.mode ?? 'coding';
				await context.telemetryService.recordStart({
					backend: run.backend,
					model: run.model,
					projectName: run.projectName,
					projectPath: run.projectPath,
					resourceId: run.id,
					resourceName: `${mode} · ${run.projectName}`,
					resourceType: 'run',
					runId: run.id,
					source: 'web',
					startedAt: run.startedAt,
				});
				return { run };
			},
			{
				body: launchBody,
			},
		)
		.post(
			'/:id/continue',
			async ({ params }) => {
				// Follow-up launch for a continuation-eligible terminal run (wall-clock timeout
				// with work remaining, or initializer completion). Same launch target, plain
				// coding mode; telemetry start is recorded inside the service so the manual and
				// auto-chain paths stay identical.
				const run = await context.runService.continueRun(params.id);
				return { run };
			},
			{ params: t.Object({ id: t.String() }) },
		)
		.post(
			'/:id/stop',
			async ({ params }) => {
				await context.runService.stopRun(params.id);
				return { ok: true };
			},
			{ params: t.Object({ id: t.String() }) },
		)
		.post(
			'/:id/kill',
			async ({ params }) => {
				await context.runService.killRun(params.id);
				return { ok: true };
			},
			{ params: t.Object({ id: t.String() }) },
		);
}
