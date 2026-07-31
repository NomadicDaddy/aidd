import { Elysia, t } from 'elysia';

import type { WebContext } from '../context.ts';

import { HttpError } from '../services/errors.ts';
import { type StatusCommandRunner } from '../services/settings/status.ts';
import { SettingsStatusCache } from '../services/settings/statusCache.ts';
import { backendNameBody } from './schemas/backend.ts';

// Panels send ?refresh=true only from their explicit Refresh control; ordinary page
// loads reuse the cached probe.
const statusRefreshQuery = t.Object({ refresh: t.Optional(t.String()) });

const nullableString = t.Union([t.String(), t.Null()]);
const nullableNumber = t.Union([t.Number(), t.Null()]);
const reasoningEffortBody = t.Union([
	t.Literal('none'),
	t.Literal('minimal'),
	t.Literal('low'),
	t.Literal('medium'),
	t.Literal('high'),
	t.Literal('xhigh'),
]);
const backendDefaultsBody = t.Object({
	idleNudgeTimeoutSeconds: t.Optional(nullableNumber),
	idleTimeoutSeconds: t.Optional(nullableNumber),
	model: t.Optional(nullableString),
	reasoningEffort: t.Optional(t.Union([reasoningEffortBody, t.Null()])),
});
const triumvirateBody = t.Object({
	execCli: t.Optional(t.Union([backendNameBody, t.Null()])),
	execModel: t.Optional(nullableString),
	overseerCli: t.Optional(t.Union([backendNameBody, t.Null()])),
	overseerModel: t.Optional(nullableString),
	secondaryCli: t.Optional(t.Union([backendNameBody, t.Null()])),
	secondaryModel: t.Optional(nullableString),
});
const directAiSurfacesBody = t.Object({
	directorChat: t.Optional(t.Boolean()),
	directorCycle: t.Optional(t.Boolean()),
	projectAdvisor: t.Optional(t.Boolean()),
	runSummaries: t.Optional(t.Boolean()),
});
const directAiBody = t.Object({
	apiKey: t.Optional(nullableString),
	baseUrl: t.Optional(nullableString),
	enabled: t.Optional(t.Boolean()),
	model: t.Optional(nullableString),
	provider: t.Optional(nullableString),
	reasoningEffort: t.Optional(t.Union([reasoningEffortBody, t.Null()])),
	surfaces: t.Optional(t.Union([directAiSurfacesBody, t.Null()])),
	timeoutSeconds: t.Optional(nullableNumber),
});

const providerBody = t.Object({
	apiKey: t.Optional(nullableString),
	baseUrl: t.Optional(nullableString),
	model: t.Optional(nullableString),
	reasoningEffort: t.Optional(t.Union([reasoningEffortBody, t.Null()])),
});

const sharedFileEntryBody = t.Object({
	source: t.String({ minLength: 1 }),
	target: t.Optional(nullableString),
});

const telegramBody = t.Object({
	allowedChatIds: t.Optional(t.Array(t.Number())),
	botToken: t.Optional(nullableString),
});

export const settingsConfigBody = t.Object({
	allowedOrigins: t.Optional(t.Array(t.String())),
	allowRemote: t.Optional(t.Boolean()),
	applicationRoots: t.Array(t.String(), { minItems: 1 }),
	applicationsRoot: t.Optional(t.Union([t.String(), t.Null()])),
	auditModel: t.Optional(nullableString),
	auditsEnabled: t.Optional(t.Boolean()),
	backends: t.Optional(
		t.Object({
			'claude-code': t.Optional(backendDefaultsBody),
			cline: t.Optional(backendDefaultsBody),
			codex: t.Optional(backendDefaultsBody),
			grok: t.Optional(backendDefaultsBody),
			kilocode: t.Optional(backendDefaultsBody),
			lmstudio: t.Optional(backendDefaultsBody),
			native: t.Optional(backendDefaultsBody),
			ollama: t.Optional(backendDefaultsBody),
			openai: t.Optional(backendDefaultsBody),
			opencode: t.Optional(backendDefaultsBody),
		}),
	),
	cli: backendNameBody,
	codeModel: t.Optional(nullableString),
	defaultProvider: t.Optional(nullableString),
	directAi: t.Optional(t.Union([directAiBody, t.Null()])),
	directorAutoCycleEnabled: t.Optional(t.Boolean()),
	directorAutoCycleIntervalHours: t.Optional(t.Number({ minimum: 1 })),
	directorChatAllowFileEdits: t.Optional(t.Boolean()),
	directorSuggestionGranularity: t.Optional(
		t.Union([t.Literal('targeted'), t.Literal('aggregate')]),
	),
	directorSuggestionMaxPerBucket: t.Optional(t.Number({ minimum: 1 })),
	dirtyTreeThreshold: t.Optional(t.Union([t.Number({ minimum: 0 }), t.Null()])),
	hostname: t.Optional(t.String()),
	idleNudgeTimeoutSeconds: t.Optional(t.Union([t.Number({ minimum: 0 }), t.Null()])),
	idleTimeoutSeconds: t.Optional(t.Union([t.Number({ minimum: 0 }), t.Null()])),
	ignoredFolders: t.Array(t.String({ minLength: 1 })),
	initModel: t.Optional(nullableString),
	maxConcurrentRuns: t.Optional(t.Number({ minimum: 1 })),
	maxConsecutiveTimeoutRetries: t.Optional(t.Union([t.Number({ minimum: 0 }), t.Null()])),
	maxCostUsd: t.Optional(t.Union([t.Number({ minimum: 0 }), t.Null()])),
	maxIterations: t.Optional(t.Union([t.Number({ minimum: 0 }), t.Null()])),
	maxTokens: t.Optional(t.Union([t.Number({ minimum: 0 }), t.Null()])),
	maxTurns: t.Optional(t.Union([t.Number({ minimum: 1 }), t.Null()])),
	model: t.Optional(nullableString),
	noClean: t.Optional(t.Boolean()),
	noWorkBackoffMs: t.Optional(t.Union([t.Number({ minimum: 0 }), t.Null()])),
	port: t.Optional(t.Number({ maximum: 65535, minimum: 1 })),
	providers: t.Optional(t.Record(t.String(), providerBody)),
	quitOnAbort: t.Optional(t.Union([t.Number({ minimum: 0 }), t.Null()])),
	rateLimitBackoffSeconds: t.Optional(t.Union([t.Number({ minimum: 0 }), t.Null()])),
	rateLimitBufferSeconds: t.Optional(t.Union([t.Number({ minimum: 0 }), t.Null()])),
	reasoningEffort: reasoningEffortBody,
	sharedDirs: t.Optional(t.Array(t.String({ minLength: 1 }))),
	sharedFiles: t.Optional(t.Array(sharedFileEntryBody)),
	showSpernakitProject: t.Optional(t.Boolean()),
	spernakitInitScript: t.Optional(nullableString),
	spernakitTemplateRef: t.Optional(nullableString),
	spernakitTemplateRepo: t.Optional(nullableString),
	telegram: t.Optional(t.Union([telegramBody, t.Null()])),
	timeoutSeconds: t.Optional(t.Union([t.Number({ minimum: 0 }), t.Null()])),
	traceDataMovement: t.Optional(t.Boolean()),
	triumvirate: t.Optional(t.Union([triumvirateBody, t.Null()])),
	useWorktrees: t.Optional(t.Boolean()),
});

export function createSettingsRoutes(
	context: WebContext,
	options: { statusCommandRunner?: StatusCommandRunner; warmStatusCache?: boolean } = {},
) {
	const statusCache = new SettingsStatusCache(options.statusCommandRunner);
	if (options.warmStatusCache) statusCache.warm();
	return new Elysia({ prefix: '/api/v1/settings' })
		.get('/config', async () => ({ config: await context.settingsService.getConfig() }))
		.get(
			'/cli-status',
			async ({ query }) => ({
				backends: await statusCache.cliStatus(query.refresh === 'true'),
			}),
			{ query: statusRefreshQuery },
		)
		.get(
			'/source-control-status',
			async ({ query }) => ({
				providers: await statusCache.sourceControlStatus(query.refresh === 'true'),
			}),
			{ query: statusRefreshQuery },
		)
		.put(
			'/config',
			async ({ body }) => {
				try {
					const result = await context.settingsService.updateConfig(body);
					context.config = result.resolvedConfig;
					context.directAiService.updateConfig(result.resolvedConfig);
					context.projectService.updateConfig(result.resolvedConfig.web);
					context.runService.updateConfig(result.resolvedConfig);
					context.directorService.updateConfig(result.resolvedConfig);
					context.auditService?.updateConfig(result.resolvedConfig);
					await context.telegramBridgeService?.updateConfig(result.resolvedConfig);
					return { config: result.config };
				} catch (err) {
					if (err instanceof HttpError) throw err;
					const message = err instanceof Error ? err.message : String(err);
					throw new HttpError(message, 400);
				}
			},
			{ body: settingsConfigBody },
		);
}
