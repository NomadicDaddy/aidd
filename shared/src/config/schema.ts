import { z } from 'zod/v4';

import { persistedReasoningEffortValues } from '../args/constants.ts';
import { directorRiskLevels } from '../contracts/director.ts';
import { backendNames, normalizeBackendName } from '../plan/types.ts';

// Names skipped during project discovery. Besides the usual VCS/build/deps noise, this includes the
// checkout's own asset directories (frontend, scaffolding) and runtime dirs (data, logs) so a
// fresh install — whose default root is the app's parent folder — never surfaces the bundled
// `scaffolding/` template (it ships with a `.aidd/`) as if it were a user project.
export const defaultIgnoredFolders = [
	'.git',
	'data',
	'dist',
	'frontend',
	'logs',
	'node_modules',
	'scaffolding',
	'screenshots',
] as const;

const backendSchema = z.preprocess(
	(value) => (typeof value === 'string' ? (normalizeBackendName(value) ?? value) : value),
	z.enum(backendNames),
);

// A project-creation template: an operator-trusted init command that scaffolds a new
// project. Spernakit is a synthesized entry (see resolve.ts); explicit entries let any
// generator (create-t3-app, degit, etc.) become a creation lane. initCommand tokens
// {name} {description} {targetPath} {root} are substituted at run time. postCreate
// 'coding-run' launches the initial coding run (the spernakit golden path); 'ingest'
// runs project-intake instead, since a third-party scaffold arrives without an .aidd
// contract or known gates.
const projectTemplateSchema = z
	.object({
		cwd: z.enum(['root', 'targetPath']).optional(),
		description: z.string().optional(),
		initCommand: z.array(z.string()).min(1),
		name: z.string().min(1),
		postCreate: z.enum(['coding-run', 'ingest']).optional(),
		requiresDescription: z.boolean().optional(),
		rootMustBeInitDir: z.boolean().optional(),
	})
	.strict();

const directAiSurfaceSchema = z
	.object({
		directorChat: z.boolean().optional(),
		directorCycle: z.boolean().optional(),
		projectAdvisor: z.boolean().optional(),
		runSummaries: z.boolean().optional(),
	})
	.strict();

const directAiSchema = z
	.object({
		baseUrl: z.string().optional(),
		enabled: z.boolean().optional(),
		model: z.string().optional(),
		provider: z.string().optional(),
		reasoningEffort: z.enum(persistedReasoningEffortValues).optional(),
		surfaces: directAiSurfaceSchema.optional(),
		timeoutSeconds: z.number().int().positive().optional(),
	})
	.strict();

const directorSchema = z
	.object({
		chat: z
			.object({
				allowFileEdits: z.boolean().optional(),
			})
			.strict()
			.optional(),
		// Accepted, but not the live schedule. It stays in this strict object for two reasons: a
		// config.json that carries it must still parse, and the cadence is read from here exactly once,
		// to seed the built-in Director scheduled task on the first boot that finds no such task. After
		// that the task owns the schedule and nothing reads these values again.
		schedule: z
			.object({
				enabled: z.boolean().optional(),
				intervalHours: z.number().positive().optional(),
			})
			.strict()
			.optional(),
		suggestions: z
			.object({
				autoLaunch: z
					.object({
						allowedRecipes: z.array(z.string().min(1)).optional(),
						enabled: z.boolean().optional(),
						maxPerCycle: z.number().int().positive().optional(),
						maxRank: z.number().int().positive().optional(),
						riskCeiling: z.enum(directorRiskLevels).optional(),
					})
					.strict()
					.optional(),
				granularity: z.enum(['targeted', 'aggregate']).optional(),
				maxPerBucket: z.number().int().positive().optional(),
			})
			.strict()
			.optional(),
	})
	.strict();

export const configSchema = z
	.object({
		applicationsRoot: z.string().optional(),
		auditModel: z.string().optional(),
		auditsEnabled: z.boolean().optional(),
		backends: z
			.partialRecord(
				z.enum(backendNames),
				z.object({
					idleNudgeTimeoutSeconds: z.number().int().nonnegative().optional(),
					idleTimeoutSeconds: z.number().int().nonnegative().optional(),
					model: z.string().optional(),
					reasoningEffort: z.enum(persistedReasoningEffortValues).optional(),
					timeoutSeconds: z.number().int().nonnegative().optional(),
				}),
			)
			.optional(),
		channels: z
			.object({
				telegram: z
					.object({
						allowedChatIds: z.array(z.number()),
						// Optional so the credential can live only in AIDD_TELEGRAM_BOT_TOKEN
						// (see config/env-secrets.ts). A section carrying neither leaves the
						// bridge unconfigured rather than failing to parse.
						botToken: z.string().optional(),
					})
					.strict()
					.optional(),
			})
			.strict()
			.optional(),
		cli: backendSchema.optional(),
		codeModel: z.string().optional(),
		complexityTieredPlanning: z.boolean().optional(),
		consistencyGateEnabled: z.boolean().optional(),
		defaultProvider: z.string().optional(),
		directAi: directAiSchema.optional(),
		director: directorSchema.optional(),
		dirtyTreeThreshold: z.number().int().nonnegative().optional(),
		idleNudgeTimeoutSeconds: z.number().int().nonnegative().optional(),
		idleTimeoutSeconds: z.number().int().nonnegative().optional(),
		maxConsecutiveTimeoutRetries: z.number().int().nonnegative().optional(),
		maxCostUsd: z.number().nonnegative().optional(),
		maxIterations: z.number().int().nonnegative().optional(),
		maxTokens: z.number().int().nonnegative().optional(),
		maxTurns: z.number().int().positive().optional(),
		model: z.string().optional(),
		noClean: z.boolean().optional(),
		noWorkBackoffMs: z.number().int().nonnegative().optional(),
		preflightDoctor: z.boolean().optional(),
		providers: z
			.record(
				z.string(),
				z.object({
					apiKey: z.string().optional(),
					baseUrl: z.string().optional(),
					model: z.string().optional(),
					reasoningEffort: z.enum(persistedReasoningEffortValues).optional(),
					// Native OpenAI-compatible streaming controls (see agent/client). `stream: false`
					// disables SSE for a non-compatible endpoint; streamIdleTimeoutMs tunes the
					// no-bytes stall timeout. JSON-only — there is no env-var equivalent.
					stream: z.boolean().optional(),
					streamIdleTimeoutMs: z.number().int().positive().optional(),
				}),
			)
			.optional(),
		quitOnAbort: z.number().int().nonnegative().optional(),
		rateLimitBackoffSeconds: z.number().int().nonnegative().optional(),
		rateLimitBufferSeconds: z.number().int().nonnegative().optional(),
		reasoningEffort: z.enum(persistedReasoningEffortValues).optional(),
		sharedDirs: z.array(z.string()).optional(),
		sharedFiles: z
			.array(
				z.union([
					z.string(),
					z.object({ source: z.string(), target: z.string().optional() }).strict(),
				]),
			)
			.optional(),
		timeoutSeconds: z.number().int().nonnegative().optional(),
		triumvirate: z
			.object({
				execCli: backendSchema.optional(),
				execModel: z.string().optional(),
				overseerCli: backendSchema.optional(),
				overseerModel: z.string().optional(),
				secondaryCli: backendSchema.optional(),
				secondaryModel: z.string().optional(),
			})
			.strict()
			.optional(),
		web: z
			.object({
				allowedOrigins: z.array(z.string()).optional(),
				allowedRoots: z.array(z.string()).optional(),
				allowRemote: z.boolean().optional(),
				authToken: z.string().optional(),
				autoChainLimit: z.number().int().positive().optional(),
				autoChainRuns: z.boolean().optional(),
				dataDir: z.string().optional(),
				hostname: z.string().optional(),
				ignoredFolders: z.array(z.string()).optional(),
				maxConcurrentRuns: z.number().int().positive().optional(),
				maxConcurrentRunsPerProject: z.number().int().positive().optional(),
				port: z.number().int().positive().max(65535).optional(),
				showSpernakitProject: z.boolean().optional(),
				spernakitFleetManifest: z.string().optional(),
				spernakitInitScript: z.string().optional(),
				spernakitTemplateRef: z.string().optional(),
				spernakitTemplateRepo: z.string().optional(),
				templates: z.array(projectTemplateSchema).optional(),
				traceDataMovement: z.boolean().optional(),
				useWorktrees: z.boolean().optional(),
			})
			.strict()
			.optional(),
	})
	.strict();

export type PartialAiddConfig = z.infer<typeof configSchema>;
export type PartialDirectAiConfig = NonNullable<PartialAiddConfig['directAi']>;
