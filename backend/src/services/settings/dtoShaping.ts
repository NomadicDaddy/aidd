import { hasProviderEnvCredential } from 'aidd-shared/agent/client';
import {
	defaultDirectorAutoLaunchAllowedRecipes,
	defaultDirectorAutoLaunchEnabled,
	defaultDirectorAutoLaunchMaxPerCycle,
	defaultDirectorAutoLaunchMaxRank,
	defaultDirectorAutoLaunchRiskCeiling,
	defaultDirectorMaxPerBucket,
	defaultDirectorSuggestionGranularity,
	type PartialAiddConfig,
	resolveMergedConfig,
} from 'aidd-shared/config';
import { type BackendName, backendNames } from 'aidd-shared/plan/types';

import type {
	BackendDefaultSettingsDto,
	DirectAiSettingsDto,
	ProviderSettingsDto,
	SharedFileEntryDto,
	TelegramChannelSettingsDto,
	TriumvirateSettingsDto,
	WebConfigSettingsDto,
} from '../../types.ts';
import type { WebRuntimeConfig } from './types.ts';

import { cleanList, defaultDirectAiSurfaces, optionalString } from './normalization.ts';

function backendDto(
	value: PartialAiddConfig['backends'] extends infer T
		? T extends Partial<Record<BackendName, infer V>>
			? undefined | V
			: never
		: never,
): BackendDefaultSettingsDto {
	return {
		idleNudgeTimeoutSeconds: value?.idleNudgeTimeoutSeconds ?? null,
		idleTimeoutSeconds: value?.idleTimeoutSeconds ?? null,
		model: value?.model ?? null,
		reasoningEffort: value?.reasoningEffort ?? null,
	};
}

function triumvirateDto(config: PartialAiddConfig): null | TriumvirateSettingsDto {
	if (!config.triumvirate) return null;
	return {
		execCli: config.triumvirate.execCli ?? null,
		execModel: config.triumvirate.execModel ?? null,
		overseerCli: config.triumvirate.overseerCli ?? null,
		overseerModel: config.triumvirate.overseerModel ?? null,
		secondaryCli: config.triumvirate.secondaryCli ?? null,
		secondaryModel: config.triumvirate.secondaryModel ?? null,
	};
}

function directAiDto(config: PartialAiddConfig): DirectAiSettingsDto {
	const directAi = config.directAi;
	const enabled = directAi?.enabled ?? false;
	const provider = optionalString(directAi?.provider ?? config.defaultProvider ?? null);
	const providerConfig = provider ? config.providers?.[provider] : undefined;
	// A key supplied by the provider's environment variable is configured just as much as one in
	// the file, and reporting it as unset would push the operator to paste it into config.json --
	// the exact arrangement `shared/src/config/env-secrets.ts` exists to move away from.
	const apiKeyConfigured = Boolean(
		optionalString(providerConfig?.apiKey) ?? (provider && hasProviderEnvCredential(provider)),
	);
	const surfaces = defaultDirectAiSurfaces(enabled);
	return {
		apiKeyConfigured,
		baseUrl: directAi?.baseUrl ?? null,
		enabled,
		model: directAi?.model ?? null,
		provider: directAi?.provider ?? null,
		reasoningEffort: directAi?.reasoningEffort ?? null,
		surfaces: {
			directorChat: directAi?.surfaces?.directorChat ?? surfaces.directorChat,
			directorCycle: directAi?.surfaces?.directorCycle ?? surfaces.directorCycle,
			projectAdvisor: directAi?.surfaces?.projectAdvisor ?? surfaces.projectAdvisor,
			runSummaries: directAi?.surfaces?.runSummaries ?? surfaces.runSummaries,
		},
		timeoutSeconds: directAi?.timeoutSeconds ?? null,
	};
}

function sharedFileDto(
	entry: { source: string; target?: string | undefined } | string,
): SharedFileEntryDto {
	if (typeof entry === 'string') return { source: entry, target: null };
	return { source: entry.source, target: entry.target ?? null };
}

function telegramDto(config: PartialAiddConfig): TelegramChannelSettingsDto {
	const telegram = config.channels?.telegram;
	return {
		allowedChatIds: telegram?.allowedChatIds ?? [],
		botTokenConfigured: Boolean(optionalString(telegram?.botToken)),
	};
}

export function buildSettingsDto(
	config: PartialAiddConfig,
	context: { configBaseDir: string; configPath: string; current: WebRuntimeConfig },
): WebConfigSettingsDto {
	const resolved = resolveMergedConfig(config, {
		applicationsRoot: config.applicationsRoot,
		baseDir: context.configBaseDir,
	});
	const backends: Partial<Record<BackendName, BackendDefaultSettingsDto>> = {};
	for (const backend of backendNames) {
		backends[backend] = backendDto(config.backends?.[backend]);
	}
	const resolvedIgnored = resolved.web?.ignoredFolders ?? context.current.web.ignoredFolders;
	const providers: Record<string, ProviderSettingsDto> = {};
	for (const [name, providerConfig] of Object.entries(config.providers ?? {})) {
		providers[name] = {
			apiKeyConfigured: Boolean(
				optionalString(providerConfig?.apiKey) ?? hasProviderEnvCredential(name),
			),
			baseUrl: providerConfig?.baseUrl ?? null,
			model: providerConfig?.model ?? null,
			reasoningEffort: providerConfig?.reasoningEffort ?? null,
		};
	}
	return {
		allowedOrigins: resolved.web?.allowedOrigins ?? context.current.web.allowedOrigins,
		allowRemote: resolved.web?.allowRemote ?? context.current.web.allowRemote,
		applicationRoots: resolved.web?.allowedRoots ?? context.current.web.allowedRoots,
		applicationsRoot: config.applicationsRoot ?? null,
		auditModel: config.auditModel ?? null,
		auditsEnabled: config.auditsEnabled ?? true,
		authTokenConfigured: Boolean(resolved.web?.authToken ?? context.current.web.authToken),
		backends,
		cli: resolved.cli,
		codeModel: config.codeModel ?? null,
		configPath: context.configPath,
		defaultProvider: config.defaultProvider ?? null,
		directAi: directAiDto(config),
		directorAutoLaunchAllowedRecipes: [
			...(resolved.director?.suggestions.autoLaunch.allowedRecipes ??
				defaultDirectorAutoLaunchAllowedRecipes),
		],
		directorAutoLaunchEnabled:
			resolved.director?.suggestions.autoLaunch.enabled ?? defaultDirectorAutoLaunchEnabled,
		directorAutoLaunchMaxPerCycle:
			resolved.director?.suggestions.autoLaunch.maxPerCycle ??
			defaultDirectorAutoLaunchMaxPerCycle,
		directorAutoLaunchMaxRank:
			resolved.director?.suggestions.autoLaunch.maxRank ?? defaultDirectorAutoLaunchMaxRank,
		directorAutoLaunchRiskCeiling:
			resolved.director?.suggestions.autoLaunch.riskCeiling ??
			defaultDirectorAutoLaunchRiskCeiling,
		directorChatAllowFileEdits: config.director?.chat?.allowFileEdits ?? false,
		directorSuggestionGranularity:
			resolved.director?.suggestions?.granularity ?? defaultDirectorSuggestionGranularity,
		directorSuggestionMaxPerBucket:
			resolved.director?.suggestions?.maxPerBucket ?? defaultDirectorMaxPerBucket,
		dirtyTreeThreshold: config.dirtyTreeThreshold ?? null,
		hostname: resolved.web?.hostname ?? context.current.web.hostname,
		idleNudgeTimeoutSeconds: config.idleNudgeTimeoutSeconds ?? null,
		idleTimeoutSeconds: config.idleTimeoutSeconds ?? null,
		ignoredFolders: cleanList(resolvedIgnored),
		maxConcurrentRuns: resolved.web?.maxConcurrentRuns ?? context.current.web.maxConcurrentRuns,
		maxConsecutiveTimeoutRetries: config.maxConsecutiveTimeoutRetries ?? null,
		maxCostUsd: config.maxCostUsd ?? null,
		maxIterations: config.maxIterations ?? null,
		maxTokens: config.maxTokens ?? null,
		maxTurns: config.maxTurns ?? null,
		model: config.model ?? null,
		noClean: resolved.noClean,
		noWorkBackoffMs: config.noWorkBackoffMs ?? null,
		port: resolved.web?.port ?? context.current.web.port,
		providers,
		quitOnAbort: config.quitOnAbort ?? null,
		rateLimitBackoffSeconds: config.rateLimitBackoffSeconds ?? null,
		rateLimitBufferSeconds: config.rateLimitBufferSeconds ?? null,
		reasoningEffort: resolved.reasoningEffort,
		sharedDirs: config.sharedDirs ?? [],
		sharedFiles: (config.sharedFiles ?? []).map(sharedFileDto),
		showSpernakitProject:
			resolved.web?.showSpernakitProject ?? context.current.web.showSpernakitProject,
		spernakitInitScript: resolved.web?.spernakitInitScript ?? null,
		spernakitTemplateRef: resolved.web?.spernakitTemplateRef ?? null,
		spernakitTemplateRepo: resolved.web?.spernakitTemplateRepo ?? null,
		telegram: telegramDto(config),
		templates: (resolved.web?.templates ?? context.current.web.templates).map((template) => ({
			description: template.description,
			name: template.name,
			postCreate: template.postCreate,
			requiresDescription: template.requiresDescription,
			rootMustBeInitDir: template.rootMustBeInitDir,
		})),
		timeoutSeconds: config.timeoutSeconds ?? null,
		traceDataMovement: resolved.web?.traceDataMovement ?? context.current.web.traceDataMovement,
		triumvirate: triumvirateDto(config),
		useWorktrees: resolved.web?.useWorktrees ?? context.current.web.useWorktrees,
	};
}
