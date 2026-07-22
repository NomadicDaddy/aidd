import { isAbsolute, relative, resolve } from 'node:path';

import type { PartialAiddConfig, PartialDirectAiConfig } from './schema.ts';
import type {
	DirectAiSurfaceConfig,
	ResolvedChannelsConfig,
	ResolvedConfig,
	ResolvedDirectorConfig,
	ResolvedDirectAiConfig,
	ResolvedWebConfig,
} from './types.ts';

import { isLoopbackHostname } from '../index.ts';
import {
	defaultDirectorIntervalHours,
	defaultDirectorMaxPerBucket,
	defaultDirectorSuggestionGranularity,
	defaultDirectAiTimeoutSeconds,
	defaultWebConfig,
	defaults,
} from './defaults.ts';
import { resolveProjectTemplates } from './resolve-templates.ts';

export function resolveProjectDirInput(
	raw: string | undefined,
	applicationsRoot: string | undefined
): string | undefined {
	if (!raw) return undefined;
	if (isAbsolute(raw)) return resolve(raw);
	const hasPathSeparator = raw.includes('/') || raw.includes('\\');
	const isExplicitlyRelative =
		raw === '.' ||
		raw === '..' ||
		raw.startsWith('./') ||
		raw.startsWith('../') ||
		raw.startsWith('.\\') ||
		raw.startsWith('..\\');
	if (hasPathSeparator || isExplicitlyRelative) return resolve(raw);
	if (applicationsRoot) return resolve(applicationsRoot, raw);
	return resolve(raw);
}

function directAiSurfaces(
	enabled: boolean,
	surfaces: PartialDirectAiConfig['surfaces']
): DirectAiSurfaceConfig {
	return {
		directorChat: surfaces?.directorChat ?? enabled,
		directorCycle: surfaces?.directorCycle ?? enabled,
		projectAdvisor: surfaces?.projectAdvisor ?? enabled,
		runSummaries: surfaces?.runSummaries ?? enabled,
	};
}

function resolveDirectAiConfig(
	directAi: PartialAiddConfig['directAi']
): ResolvedDirectAiConfig | undefined {
	if (!directAi) return undefined;
	const enabled = directAi.enabled ?? false;
	return {
		...(directAi.baseUrl !== undefined ? { baseUrl: directAi.baseUrl } : {}),
		enabled,
		...(directAi.model !== undefined ? { model: directAi.model } : {}),
		...(directAi.provider !== undefined ? { provider: directAi.provider } : {}),
		...(directAi.reasoningEffort !== undefined
			? { reasoningEffort: directAi.reasoningEffort }
			: {}),
		surfaces: directAiSurfaces(enabled, directAi.surfaces),
		timeoutSeconds: directAi.timeoutSeconds ?? defaultDirectAiTimeoutSeconds,
	};
}

function resolveDirectorConfig(
	director: PartialAiddConfig['director']
): ResolvedDirectorConfig | undefined {
	if (!director) return undefined;
	return {
		chat: {
			allowFileEdits: director.chat?.allowFileEdits ?? false,
		},
		schedule: {
			enabled: director.schedule?.enabled ?? false,
			intervalHours: director.schedule?.intervalHours ?? defaultDirectorIntervalHours,
		},
		suggestions: {
			granularity: director.suggestions?.granularity ?? defaultDirectorSuggestionGranularity,
			maxPerBucket: director.suggestions?.maxPerBucket ?? defaultDirectorMaxPerBucket,
		},
	};
}

function cleanStringList(values: string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function normalizeAllowedOrigins(values: string[]): string[] {
	return [
		...new Set(
			cleanStringList(values).map((value) => {
				try {
					const parsed = new URL(value);
					if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') {
						throw new Error('origin must not include a path, query, or hash');
					}
					return parsed.origin;
				} catch (error) {
					const detail = error instanceof Error ? error.message : String(error);
					throw new Error(`web.allowedOrigins entry "${value}" is invalid: ${detail}`, {
						cause: error,
					});
				}
			})
		),
	];
}

interface ResolveWebConfigOptions {
	baseDir?: string | undefined;
}

function resolveWebConfig(
	merged: PartialAiddConfig,
	options: ResolveWebConfigOptions = {}
): ResolvedWebConfig {
	const baseDir = resolve(options.baseDir ?? process.cwd());
	const fallbackRoot = merged.applicationsRoot ?? resolve(baseDir, '..');
	const configuredRoots = merged.web?.allowedRoots ?? [fallbackRoot];
	const configuredAllowedOrigins = merged.web?.allowedOrigins ?? defaultWebConfig.allowedOrigins;
	const configuredIgnoredFolders = merged.web?.ignoredFolders ?? defaultWebConfig.ignoredFolders;
	const dataRoot = resolve(baseDir, 'data');
	const configuredDataDir = merged.web?.dataDir ? resolve(baseDir, merged.web.dataDir) : dataRoot;
	const repoRelation = relative(baseDir, configuredDataDir).replace(/\\/g, '/');
	if (repoRelation === 'backend/data' || repoRelation.startsWith('backend/data/')) {
		throw new Error(
			'web.dataDir must use the repository root data directory, not backend/data'
		);
	}
	const dataRelation = relative(dataRoot, configuredDataDir);
	if (dataRelation !== '' && (dataRelation.startsWith('..') || isAbsolute(dataRelation))) {
		throw new Error(`web.dataDir must be inside ${dataRoot}`);
	}
	const hostname = merged.web?.hostname?.trim() ?? defaultWebConfig.hostname;
	if (hostname.length === 0) {
		throw new Error('web.hostname must not be empty');
	}
	const allowRemote = merged.web?.allowRemote ?? defaultWebConfig.allowRemote;
	if (!allowRemote && !isLoopbackHostname(hostname)) {
		throw new Error(
			`web.hostname "${hostname}" is not a loopback address. ` +
				'Set web.allowRemote: true to bind to a public interface.'
		);
	}
	const authToken = merged.web?.authToken?.trim();
	if (allowRemote && !authToken) {
		throw new Error(
			'web.allowRemote is true but web.authToken is missing or blank. ' +
				'Remote-bound control panels must require an auth token.'
		);
	}
	return {
		allowedOrigins: normalizeAllowedOrigins(configuredAllowedOrigins),
		allowedRoots: [...new Set(configuredRoots.map((root) => resolve(root)))],
		allowRemote,
		...(authToken ? { authToken } : {}),
		autoChainLimit: merged.web?.autoChainLimit ?? defaultWebConfig.autoChainLimit,
		autoChainRuns: merged.web?.autoChainRuns ?? defaultWebConfig.autoChainRuns,
		dataDir: configuredDataDir,
		hostname,
		ignoredFolders: cleanStringList(configuredIgnoredFolders),
		maxConcurrentRuns: merged.web?.maxConcurrentRuns ?? defaultWebConfig.maxConcurrentRuns,
		maxConcurrentRunsPerProject:
			merged.web?.maxConcurrentRunsPerProject ?? defaultWebConfig.maxConcurrentRunsPerProject,
		port: merged.web?.port ?? defaultWebConfig.port,
		showSpernakitProject:
			merged.web?.showSpernakitProject ?? defaultWebConfig.showSpernakitProject,
		// Defaults to spernakit.psd1 beside the init script so existing configs get
		// Spernakit-derived detection without a new setting.
		spernakitFleetManifest: merged.web?.spernakitFleetManifest
			? resolve(baseDir, merged.web.spernakitFleetManifest)
			: merged.web?.spernakitInitScript
				? resolve(baseDir, merged.web.spernakitInitScript, '..', 'spernakit.psd1')
				: null,
		spernakitInitScript: merged.web?.spernakitInitScript
			? resolve(baseDir, merged.web.spernakitInitScript)
			: null,
		spernakitTemplateRef:
			merged.web?.spernakitTemplateRef ?? defaultWebConfig.spernakitTemplateRef,
		spernakitTemplateRepo:
			merged.web?.spernakitTemplateRepo ?? defaultWebConfig.spernakitTemplateRepo,
		templates: resolveProjectTemplates(merged.web?.templates),
		traceDataMovement: merged.web?.traceDataMovement ?? defaultWebConfig.traceDataMovement,
		useWorktrees: merged.web?.useWorktrees ?? defaultWebConfig.useWorktrees,
	};
}

function resolveChannelsConfig(
	channels: PartialAiddConfig['channels']
): ResolvedChannelsConfig | undefined {
	if (!channels?.telegram) return undefined;
	return {
		telegram: {
			allowedChatIds: [...channels.telegram.allowedChatIds],
			botToken: channels.telegram.botToken,
		},
	};
}

interface ResolveMergedConfigOptions {
	applicationsRoot?: string | undefined;
	baseDir?: string | undefined;
	modelOverride?: string | undefined;
	resolvedProjectDir?: string | undefined;
}

export function resolveMergedConfig(
	merged: PartialAiddConfig,
	options: ResolveMergedConfigOptions = {}
): ResolvedConfig {
	const cli = merged.cli ?? defaults.cli;
	const backendOverrides = merged.backends?.[cli] ?? {};
	const directAi = resolveDirectAiConfig(merged.directAi);
	const resolved: ResolvedConfig = {
		auditsEnabled: merged.auditsEnabled ?? true,
		cli,
		dirtyTreeThreshold: merged.dirtyTreeThreshold ?? defaults.dirtyTreeThreshold,
		idleNudgeTimeoutSeconds:
			backendOverrides.idleNudgeTimeoutSeconds ??
			merged.idleNudgeTimeoutSeconds ??
			defaults.idleNudgeTimeoutSeconds,
		idleTimeoutSeconds:
			backendOverrides.idleTimeoutSeconds ??
			merged.idleTimeoutSeconds ??
			defaults.idleTimeoutSeconds,
		maxConsecutiveTimeoutRetries:
			merged.maxConsecutiveTimeoutRetries ?? defaults.maxConsecutiveTimeoutRetries,
		maxIterations: merged.maxIterations ?? defaults.maxIterations,
		noClean: merged.noClean ?? defaults.noClean,
		noWorkBackoffMs: merged.noWorkBackoffMs ?? defaults.noWorkBackoffMs,
		preflightDoctor: merged.preflightDoctor ?? defaults.preflightDoctor ?? true,
		quitOnAbort: merged.quitOnAbort ?? defaults.quitOnAbort,
		rateLimitBackoffSeconds: merged.rateLimitBackoffSeconds ?? defaults.rateLimitBackoffSeconds,
		rateLimitBufferSeconds: merged.rateLimitBufferSeconds ?? defaults.rateLimitBufferSeconds,
		reasoningEffort: merged.reasoningEffort ?? defaults.reasoningEffort,
		timeoutSeconds:
			backendOverrides.timeoutSeconds ?? merged.timeoutSeconds ?? defaults.timeoutSeconds,
		web: resolveWebConfig(merged, { baseDir: options.baseDir }),
	};
	if (merged.backends !== undefined) resolved.backends = merged.backends;
	if (merged.defaultProvider !== undefined) resolved.defaultProvider = merged.defaultProvider;
	if (directAi !== undefined) resolved.directAi = directAi;
	const director = resolveDirectorConfig(merged.director);
	if (director !== undefined) resolved.director = director;
	if (merged.model !== undefined) resolved.sharedModel = merged.model;
	if (merged.providers !== undefined) resolved.providers = merged.providers;
	if (merged.initModel !== undefined) resolved.initModel = merged.initModel;
	if (merged.codeModel !== undefined) resolved.codeModel = merged.codeModel;
	if (merged.complexityTieredPlanning !== undefined)
		resolved.complexityTieredPlanning = merged.complexityTieredPlanning;
	if (merged.consistencyGateEnabled !== undefined)
		resolved.consistencyGateEnabled = merged.consistencyGateEnabled;
	if (merged.maxCostUsd !== undefined) resolved.maxCostUsd = merged.maxCostUsd;
	if (merged.maxTokens !== undefined) resolved.maxTokens = merged.maxTokens;
	if (merged.auditModel !== undefined) resolved.auditModel = merged.auditModel;
	if (merged.triumvirate !== undefined) resolved.triumvirate = merged.triumvirate;
	// CLI model overrides have highest precedence, then backend-specific, then shared.
	const model = options.modelOverride ?? backendOverrides.model ?? merged.model;
	if (model !== undefined) resolved.model = model;
	const applicationsRoot = options.applicationsRoot ?? merged.applicationsRoot;
	if (applicationsRoot !== undefined) resolved.applicationsRoot = applicationsRoot;
	if (options.resolvedProjectDir !== undefined) resolved.projectDir = options.resolvedProjectDir;
	if (merged.sharedDirs !== undefined) resolved.sharedDirs = merged.sharedDirs;
	if (merged.sharedFiles !== undefined) resolved.sharedFiles = merged.sharedFiles;
	const channels = resolveChannelsConfig(merged.channels);
	if (channels !== undefined) resolved.channels = channels;
	return resolved;
}
