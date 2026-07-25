import type {
	ProviderSettings,
	SettingsCliStatus,
	SettingsSourceControlStatus,
	WebConfigSettings,
} from './types.ts';

import { apiGet, apiSend } from './client.ts';

export async function getSettingsConfig(): Promise<WebConfigSettings> {
	const response = await apiGet<{ config: WebConfigSettings }>('/api/v1/settings/config');
	return response.config;
}

export async function updateSettingsConfig(request: WebConfigSettings): Promise<WebConfigSettings> {
	const body = {
		allowedOrigins: request.allowedOrigins,
		allowRemote: request.allowRemote,
		applicationRoots: request.applicationRoots,
		applicationsRoot: request.applicationsRoot,
		auditModel: request.auditModel,
		auditsEnabled: request.auditsEnabled,
		backends: request.backends,
		cli: request.cli,
		codeModel: request.codeModel,
		defaultProvider: request.defaultProvider,
		directAi: {
			...(request.directAi.apiKey !== undefined ? { apiKey: request.directAi.apiKey } : {}),
			baseUrl: request.directAi.baseUrl,
			enabled: request.directAi.enabled,
			model: request.directAi.model,
			provider: request.directAi.provider,
			reasoningEffort: request.directAi.reasoningEffort,
			surfaces: request.directAi.surfaces,
			timeoutSeconds: request.directAi.timeoutSeconds,
		},
		directorAutoCycleEnabled: request.directorAutoCycleEnabled,
		directorAutoCycleIntervalHours: request.directorAutoCycleIntervalHours,
		directorChatAllowFileEdits: request.directorChatAllowFileEdits,
		directorSuggestionGranularity: request.directorSuggestionGranularity,
		directorSuggestionMaxPerBucket: request.directorSuggestionMaxPerBucket,
		dirtyTreeThreshold: request.dirtyTreeThreshold,
		hostname: request.hostname,
		idleNudgeTimeoutSeconds: request.idleNudgeTimeoutSeconds,
		idleTimeoutSeconds: request.idleTimeoutSeconds,
		ignoredFolders: request.ignoredFolders,
		initModel: request.initModel,
		maxConcurrentRuns: request.maxConcurrentRuns,
		maxIterations: request.maxIterations,
		maxTurns: request.maxTurns,
		model: request.model,
		noClean: request.noClean,
		noWorkBackoffMs: request.noWorkBackoffMs,
		port: request.port,
		providers: buildProvidersBody(request.providers),
		quitOnAbort: request.quitOnAbort,
		rateLimitBackoffSeconds: request.rateLimitBackoffSeconds,
		rateLimitBufferSeconds: request.rateLimitBufferSeconds,
		reasoningEffort: request.reasoningEffort,
		sharedDirs: request.sharedDirs,
		sharedFiles: request.sharedFiles,
		showSpernakitProject: request.showSpernakitProject,
		spernakitInitScript: request.spernakitInitScript,
		spernakitTemplateRef: request.spernakitTemplateRef,
		spernakitTemplateRepo: request.spernakitTemplateRepo,
		telegram: {
			...(request.telegram.botToken !== undefined
				? { botToken: request.telegram.botToken }
				: {}),
			allowedChatIds: request.telegram.allowedChatIds,
		},
		timeoutSeconds: request.timeoutSeconds,
		traceDataMovement: request.traceDataMovement,
		triumvirate: request.triumvirate,
		useWorktrees: request.useWorktrees,
	};
	const response = await apiSend<{ config: WebConfigSettings }>(
		'/api/v1/settings/config',
		'PUT',
		body,
	);
	return response.config;
}

function buildProvidersBody(providers: Record<string, ProviderSettings>): Record<
	string,
	{
		apiKey?: null | string;
		baseUrl: null | string;
		model: null | string;
		reasoningEffort: null | string;
	}
> {
	const result: Record<
		string,
		{
			apiKey?: null | string;
			baseUrl: null | string;
			model: null | string;
			reasoningEffort: null | string;
		}
	> = {};
	for (const [name, provider] of Object.entries(providers)) {
		const entry: (typeof result)[string] = {
			baseUrl: provider.baseUrl,
			model: provider.model,
			reasoningEffort: provider.reasoningEffort,
		};
		if (provider.apiKey !== undefined) {
			entry.apiKey = provider.apiKey;
		}
		result[name] = entry;
	}
	return result;
}

// The backend probes installed CLIs once and caches the result; `refresh` forces a
// re-probe and is sent only from the panels' Refresh controls.
const refreshSuffix = (refresh: boolean) => (refresh ? '?refresh=true' : '');

export async function getCliStatus(refresh = false): Promise<SettingsCliStatus[]> {
	const response = await apiGet<{ backends: SettingsCliStatus[] }>(
		`/api/v1/settings/cli-status${refreshSuffix(refresh)}`,
	);
	return response.backends;
}

export async function getSourceControlStatus(
	refresh = false,
): Promise<SettingsSourceControlStatus[]> {
	const response = await apiGet<{ providers: SettingsSourceControlStatus[] }>(
		`/api/v1/settings/source-control-status${refreshSuffix(refresh)}`,
	);
	return response.providers;
}
