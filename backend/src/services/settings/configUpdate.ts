import {
	configSchema,
	defaultIgnoredFolders,
	normalizeAllowedOrigins,
	type PartialAiddConfig,
} from 'aidd-shared/config';
import { randomBytes } from 'node:crypto';

import type { WebConfigSettingsInput, WebRuntimeConfig } from './types.ts';

import { applyDirectorInput } from './directorInput.ts';
import { mergeProviders } from './mergeProviders.ts';
import {
	applyDirectAiApiKey,
	cleanList,
	effectiveDirectAiProvider,
	mergeBackendDefaults,
	normalizeBackendInput,
	normalizeDirectAiInput,
	normalizeSharedFiles,
	normalizeTelegramInput,
	normalizeTriumvirateInput,
	optionalNumber,
	optionalString,
	setOptionalString,
} from './normalization.ts';
import {
	assertDirectAiResolvable,
	assertSafeAgentBaseUrl,
	assertValidApplicationRoots,
} from './validation.ts';

const runtimeNumberFields = [
	'dirtyTreeThreshold',
	'idleNudgeTimeoutSeconds',
	'idleTimeoutSeconds',
	'maxConsecutiveTimeoutRetries',
	'maxCostUsd',
	'maxIterations',
	'maxTokens',
	'maxTurns',
	'noWorkBackoffMs',
	'quitOnAbort',
	'rateLimitBackoffSeconds',
	'rateLimitBufferSeconds',
	'timeoutSeconds',
] as const;

function generateRemoteAuthToken(): string {
	return randomBytes(32).toString('base64url');
}

function applyNetworkInput(next: PartialAiddConfig, input: WebConfigSettingsInput): void {
	const hostname = optionalString(input.hostname);
	if (input.hostname !== undefined) {
		if (hostname === undefined) {
			throw new Error('web.hostname must be a non-empty string');
		}
		next.web = { ...(next.web ?? {}), hostname };
	}
	if (input.port !== undefined) {
		if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
			throw new Error('web.port must be an integer between 1 and 65535');
		}
		next.web = { ...(next.web ?? {}), port: input.port };
	}
	if (input.spernakitInitScript !== undefined) {
		const spernakitScript = optionalString(input.spernakitInitScript);
		if (spernakitScript === undefined) {
			if (next.web) delete next.web.spernakitInitScript;
		} else {
			next.web = { ...(next.web ?? {}), spernakitInitScript: spernakitScript };
		}
	}
	if (input.spernakitTemplateRef !== undefined) {
		const value = optionalString(input.spernakitTemplateRef);
		if (value === undefined) {
			if (next.web) delete next.web.spernakitTemplateRef;
		} else {
			next.web = { ...(next.web ?? {}), spernakitTemplateRef: value };
		}
	}
	if (input.spernakitTemplateRepo !== undefined) {
		const value = optionalString(input.spernakitTemplateRepo);
		if (value === undefined) {
			if (next.web) delete next.web.spernakitTemplateRepo;
		} else {
			next.web = { ...(next.web ?? {}), spernakitTemplateRepo: value };
		}
	}
}

function applyProviderInput(
	next: PartialAiddConfig,
	existing: PartialAiddConfig,
	input: WebConfigSettingsInput,
): void {
	const defaultProvider = optionalString(input.defaultProvider);
	if (input.defaultProvider !== undefined) {
		if (defaultProvider === undefined) delete next.defaultProvider;
		else next.defaultProvider = defaultProvider;
	}
	if (input.providers !== undefined) {
		const merged = mergeProviders(input.providers, existing.providers);
		for (const [name, providerConfig] of Object.entries(merged)) {
			const baseUrl = optionalString(providerConfig?.baseUrl);
			if (baseUrl !== undefined) assertSafeAgentBaseUrl(baseUrl, `Provider "${name}"`);
		}
		if (Object.keys(merged).length === 0) delete next.providers;
		else next.providers = merged;
	}
	if ('directAi' in input) {
		const directAiBaseUrl = optionalString(input.directAi?.baseUrl);
		if (directAiBaseUrl !== undefined) {
			assertSafeAgentBaseUrl(directAiBaseUrl, 'Direct AI');
		}
		const directAi = normalizeDirectAiInput(input.directAi, existing.directAi !== undefined);
		if (directAi === undefined) delete next.directAi;
		else next.directAi = directAi;
		const effectiveProvider = effectiveDirectAiProvider(input.directAi, existing);
		applyDirectAiApiKey(next, input.directAi?.apiKey, effectiveProvider);
		assertDirectAiResolvable(next, effectiveProvider);
	}
}

function applyRuntimeInput(next: PartialAiddConfig, input: WebConfigSettingsInput): void {
	for (const field of runtimeNumberFields) {
		if (field in input) {
			const value = optionalNumber(
				(input as unknown as Record<string, unknown>)[field] as null | number | undefined,
			);
			if (value === undefined) delete next[field];
			else next[field] = value;
		}
	}
	if ('noClean' in input) {
		next.noClean = input.noClean ?? false;
	}
}

function applySharedInput(next: PartialAiddConfig, input: WebConfigSettingsInput): void {
	if ('sharedDirs' in input) {
		const dirs = cleanList(input.sharedDirs ?? []);
		if (dirs.length === 0) delete next.sharedDirs;
		else next.sharedDirs = dirs;
	}
	if ('sharedFiles' in input) {
		const normalized = normalizeSharedFiles(input.sharedFiles ?? []);
		if (normalized === undefined) delete next.sharedFiles;
		else next.sharedFiles = normalized;
	}
}

function createBaseConfig(
	existing: PartialAiddConfig,
	input: WebConfigSettingsInput,
): PartialAiddConfig {
	assertValidApplicationRoots(input.applicationRoots);
	const applicationRoots = cleanList(input.applicationRoots);
	const allowedOrigins = normalizeAllowedOrigins(input.allowedOrigins ?? []);
	const ignoredFolders = cleanList(input.ignoredFolders);
	return {
		...existing,
		auditsEnabled: input.auditsEnabled ?? existing.auditsEnabled ?? true,
		cli: normalizeBackendInput(input.cli),
		reasoningEffort: input.reasoningEffort,
		web: {
			...existing.web,
			allowedRoots: applicationRoots,
			...(input.allowedOrigins !== undefined ? { allowedOrigins } : {}),
			...(input.allowRemote !== undefined ? { allowRemote: input.allowRemote } : {}),
			ignoredFolders: ignoredFolders.length > 0 ? ignoredFolders : [...defaultIgnoredFolders],
			...(input.maxConcurrentRuns !== undefined
				? { maxConcurrentRuns: input.maxConcurrentRuns }
				: {}),
			...(input.showSpernakitProject !== undefined
				? { showSpernakitProject: input.showSpernakitProject }
				: {}),
			...(input.traceDataMovement !== undefined
				? { traceDataMovement: input.traceDataMovement }
				: {}),
			...(input.useWorktrees !== undefined ? { useWorktrees: input.useWorktrees } : {}),
		},
	};
}

export function buildUpdatedConfig(
	input: WebConfigSettingsInput,
	existing: PartialAiddConfig,
	currentConfig: WebRuntimeConfig,
): PartialAiddConfig {
	const next = createBaseConfig(existing, input);
	if (input.applicationsRoot !== undefined) {
		const applicationsRoot = optionalString(input.applicationsRoot);
		if (applicationsRoot === undefined) delete next.applicationsRoot;
		else next.applicationsRoot = applicationsRoot;
	}

	const existingAuthToken = optionalString(
		existing.web?.authToken ?? currentConfig.web.authToken ?? null,
	);
	if (input.allowRemote === true && existingAuthToken === undefined) {
		next.web = { ...(next.web ?? {}), authToken: generateRemoteAuthToken() };
	}

	applyNetworkInput(next, input);
	setOptionalString(next, 'model', input.model);
	setOptionalString(next, 'codeModel', input.codeModel);
	setOptionalString(next, 'auditModel', input.auditModel);
	applyProviderInput(next, existing, input);
	applyDirectorInput(next, existing, input);

	const mergedBackends = mergeBackendDefaults(input.backends, existing.backends);
	if (mergedBackends === undefined) delete next.backends;
	else next.backends = mergedBackends;

	if ('triumvirate' in input) {
		const normalizedTriumvirate = normalizeTriumvirateInput(input.triumvirate);
		if (normalizedTriumvirate === undefined) delete next.triumvirate;
		else next.triumvirate = normalizedTriumvirate;
	}

	applyRuntimeInput(next, input);
	applySharedInput(next, input);

	if ('telegram' in input) {
		const channels = normalizeTelegramInput(input.telegram, next);
		if (channels === undefined) delete next.channels;
		else next.channels = channels;
	}

	const result = configSchema.safeParse(next);
	if (!result.success) {
		throw new Error('Updated config failed validation.');
	}
	return result.data;
}
