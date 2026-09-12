import type {
	ProviderSettings,
	SettingsCliStatus,
	SettingsSourceControlStatus,
	WebConfigSettings,
} from './types.ts';

import { apiGet, apiSend } from './client.ts';

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
		directorAutoLaunchAllowedRecipes: request.directorAutoLaunchAllowedRecipes,
		directorAutoLaunchEnabled: request.directorAutoLaunchEnabled,
		directorAutoLaunchMaxPerCycle: request.directorAutoLaunchMaxPerCycle,
		directorAutoLaunchMaxRank: request.directorAutoLaunchMaxRank,
		directorAutoLaunchRiskCeiling: request.directorAutoLaunchRiskCeiling,
		directorChatAllowFileEdits: request.directorChatAllowFileEdits,
		directorSuggestionGranularity: request.directorSuggestionGranularity,
		directorSuggestionMaxPerBucket: request.directorSuggestionMaxPerBucket,
		dirtyTreeThreshold: request.dirtyTreeThreshold,
		hostname: request.hostname,
		idleNudgeTimeoutSeconds: request.idleNudgeTimeoutSeconds,
		idleTimeoutSeconds: request.idleTimeoutSeconds,
		ignoredFolders: request.ignoredFolders,
		maxConcurrentRuns: request.maxConcurrentRuns,
		maxConsecutiveTimeoutRetries: request.maxConsecutiveTimeoutRetries,
		maxCostUsd: request.maxCostUsd,
		maxIterations: request.maxIterations,
		maxTokens: request.maxTokens,
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

/**
 * Resolves the endpoint's own `{ valid: true }` body rather than `void`. This is consumed
 * directly as a TanStack Query v5 `queryFn`, and v5 rejects a query that resolves `undefined`
 * — which turned every successful HTTP 200 into an `isError` state whose message was the
 * serialised query key, and (with `retry: false` + `staleTime: Infinity`) blocked Save on all
 * five Settings tabs permanently. Never narrow this back to `Promise<void>`.
 */
export async function validateApplicationRoots(
	applicationRoots: string[],
): Promise<{ valid: true }> {
	return await apiSend<{ valid: true }>('/api/v1/settings/application-roots/validate', 'POST', {
		applicationRoots,
	});
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
