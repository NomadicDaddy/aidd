import type { PartialAiddConfig } from 'aidd-shared/config';

import {
	type BackendInputName,
	type BackendName,
	backendNames,
	normalizeBackendName,
} from 'aidd-shared/plan/types';

import type {
	BackendDefaultSettingsInput,
	DirectAiSettingsInput,
	DirectAiSurfaceSettingsInput,
	SharedFileEntryInput,
	TelegramChannelSettingsInput,
	TriumvirateSettingsInput,
} from './types.ts';

export function optionalString(value: null | string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

export function optionalNumber(value: null | number | undefined): number | undefined {
	return value === null || value === undefined ? undefined : value;
}

export function cleanList(values: string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/** Set or clear a top-level optional string field from a PUT payload value.
 * An absent key (undefined) preserves the existing value; clearing requires an
 * explicit null or blank string — never clear-on-absent.
 * @param config - The config object being built.
 * @param key - The top-level optional string field to update.
 * @param value - The raw payload value (undefined preserves, null/blank clears).
 */
export function setOptionalString(
	config: PartialAiddConfig,
	key: 'auditModel' | 'codeModel' | 'model',
	value: null | string | undefined,
): void {
	if (value === undefined) return;
	const next = optionalString(value);
	if (next === undefined) delete config[key];
	else config[key] = next;
}

export function normalizeBackendInput(value: BackendInputName): BackendName {
	const normalized = normalizeBackendName(value);
	if (!normalized) throw new Error(`Invalid CLI type: ${value}`);
	return normalized;
}

/** Fields the settings UI controls on a backend entry and replaces individually. Every other key
 * (e.g. `timeoutSeconds`) is unmanaged: JSON-config-only, and carried forward verbatim. */
const managedBackendFields = new Set([
	'idleNudgeTimeoutSeconds',
	'idleTimeoutSeconds',
	'model',
	'reasoningEffort',
]);

/** Merge backend default inputs into existing, returning the merged map.
 * @param input - The backend default settings input.
 * @param existing - The existing backend defaults config.
 * @returns Merged backend defaults or undefined.
 */
export function mergeBackendDefaults(
	input: Partial<Record<BackendName, BackendDefaultSettingsInput>> | undefined,
	existing: PartialAiddConfig['backends'],
): PartialAiddConfig['backends'] {
	if (input === undefined) return existing;
	type BackendEntry = NonNullable<NonNullable<PartialAiddConfig['backends']>[BackendName]>;
	const merged: Partial<Record<BackendName, BackendEntry>> = { ...(existing ?? {}) };
	for (const backend of backendNames) {
		const entry = input[backend];
		if (entry === undefined) continue;
		// Carry forward keys the settings UI does not manage (e.g. `timeoutSeconds`) from the
		// existing entry, the same way mergeProviders preserves `stream`/`streamIdleTimeoutMs`.
		// Rebuilding the entry from the managed fields alone silently deleted a hand-written
		// per-backend timeout the first time anyone pressed Save.
		const existingEntry: BackendEntry = merged[backend] ?? {};
		const unmanaged: BackendEntry = {};
		for (const [key, value] of Object.entries(existingEntry)) {
			if (!managedBackendFields.has(key)) {
				(unmanaged as Record<string, unknown>)[key] = value;
			}
		}
		const normalized: BackendEntry = {
			...unmanaged,
			...(optionalString(entry.model) !== undefined
				? { model: optionalString(entry.model) }
				: {}),
			...(optionalNumber(entry.idleTimeoutSeconds) !== undefined
				? { idleTimeoutSeconds: optionalNumber(entry.idleTimeoutSeconds) }
				: {}),
			...(optionalNumber(entry.idleNudgeTimeoutSeconds) !== undefined
				? { idleNudgeTimeoutSeconds: optionalNumber(entry.idleNudgeTimeoutSeconds) }
				: {}),
			...(entry.reasoningEffort ? { reasoningEffort: entry.reasoningEffort } : {}),
		};
		if (Object.keys(normalized).length === 0) delete merged[backend];
		else merged[backend] = normalized;
	}
	return Object.keys(merged).length === 0 ? undefined : merged;
}

/** Normalize triumvirate input into config-shape, or undefined to clear.
 * @param input - The triumvirate settings input.
 * @returns Normalized triumvirate config or undefined.
 */
export function normalizeTriumvirateInput(
	input: null | TriumvirateSettingsInput | undefined,
): PartialAiddConfig['triumvirate'] {
	if (!input) return undefined;
	const normalized: NonNullable<PartialAiddConfig['triumvirate']> = {
		...(normalizeOptionalBackendInput(input.secondaryCli) !== undefined
			? { secondaryCli: normalizeOptionalBackendInput(input.secondaryCli) }
			: {}),
		...(optionalString(input.secondaryModel) !== undefined
			? { secondaryModel: optionalString(input.secondaryModel) }
			: {}),
		...(normalizeOptionalBackendInput(input.overseerCli) !== undefined
			? { overseerCli: normalizeOptionalBackendInput(input.overseerCli) }
			: {}),
		...(optionalString(input.overseerModel) !== undefined
			? { overseerModel: optionalString(input.overseerModel) }
			: {}),
		...(normalizeOptionalBackendInput(input.execCli) !== undefined
			? { execCli: normalizeOptionalBackendInput(input.execCli) }
			: {}),
		...(optionalString(input.execModel) !== undefined
			? { execModel: optionalString(input.execModel) }
			: {}),
	};
	if (Object.keys(normalized).length === 0) return undefined;
	return normalized;
}

/** Normalize structured sharedFiles input into the string-or-object schema shape.
 * @param entries - The shared file entries to normalize.
 * @returns Normalized shared files or undefined.
 */
export function normalizeSharedFiles(
	entries: SharedFileEntryInput[],
): PartialAiddConfig['sharedFiles'] {
	if (entries.length === 0) return undefined;
	return entries.map((entry) => {
		const target = optionalString(entry.target);
		if (target === undefined) return entry.source;
		return { source: entry.source, target };
	});
}

export function normalizeOptionalBackendInput(
	value: BackendInputName | null | undefined,
): BackendName | undefined {
	if (value === null || value === undefined) return undefined;
	return normalizeBackendInput(value);
}

export function defaultDirectAiSurfaces(enabled: boolean): Required<DirectAiSurfaceSettingsInput> {
	return {
		directorChat: enabled,
		directorCycle: enabled,
		projectAdvisor: enabled,
		runSummaries: enabled,
	};
}

export function effectiveDirectAiProvider(
	input: DirectAiSettingsInput | null | undefined,
	existing: PartialAiddConfig,
): string {
	return (
		optionalString(input?.provider) ??
		optionalString(existing.directAi?.provider) ??
		optionalString(existing.defaultProvider) ??
		'zhipu'
	);
}

export function applyDirectAiApiKey(
	next: PartialAiddConfig,
	apiKey: null | string | undefined,
	provider: string,
): void {
	if (apiKey === undefined) return;
	const providers = { ...(next.providers ?? {}) };
	const existingProvider = providers[provider] ?? {};
	const trimmed = typeof apiKey === 'string' ? apiKey.trim() : '';
	if (apiKey === null || trimmed.length === 0) {
		if (existingProvider.apiKey === undefined) return;
		const { apiKey: _omit, ...rest } = existingProvider;
		if (Object.keys(rest).length === 0) {
			delete providers[provider];
		} else {
			providers[provider] = rest;
		}
	} else {
		providers[provider] = { ...existingProvider, apiKey: trimmed };
	}
	if (Object.keys(providers).length === 0) delete next.providers;
	else next.providers = providers;
}

export function normalizeDirectAiInput(
	input: DirectAiSettingsInput | null | undefined,
	keepWhenDisabled: boolean,
): PartialAiddConfig['directAi'] {
	if (!input) return undefined;
	const enabled = input.enabled ?? false;
	if (!enabled && !keepWhenDisabled) return undefined;
	const surfaces = defaultDirectAiSurfaces(enabled);
	const normalized: NonNullable<PartialAiddConfig['directAi']> = {
		enabled,
		surfaces: {
			directorChat: input.surfaces?.directorChat ?? surfaces.directorChat,
			directorCycle: input.surfaces?.directorCycle ?? surfaces.directorCycle,
			projectAdvisor: input.surfaces?.projectAdvisor ?? surfaces.projectAdvisor,
			runSummaries: input.surfaces?.runSummaries ?? surfaces.runSummaries,
		},
	};
	const provider = optionalString(input.provider);
	if (provider !== undefined) normalized.provider = provider;
	const model = optionalString(input.model);
	if (model !== undefined) normalized.model = model;
	const baseUrl = optionalString(input.baseUrl);
	if (baseUrl !== undefined) normalized.baseUrl = baseUrl;
	if (input.reasoningEffort) normalized.reasoningEffort = input.reasoningEffort;
	if (input.timeoutSeconds !== null && input.timeoutSeconds !== undefined) {
		normalized.timeoutSeconds = input.timeoutSeconds;
	}
	return normalized;
}

/** Normalize telegram channel input into the config-shape channels block.
 * botToken is write-only (null/undefined preserves existing, null clears, non-empty string replaces);
 * allowedChatIds replaces the whole array.
 * @param input - The telegram channel settings input (null to clear).
 * @param existing - The existing config for fallback.
 * @returns Updated channels block or undefined to clear.
 */
export function normalizeTelegramInput(
	input: null | TelegramChannelSettingsInput | undefined,
	existing: PartialAiddConfig,
): PartialAiddConfig['channels'] {
	if (input === null) return undefined;
	if (input === undefined) return existing.channels;
	const existingTelegram = existing.channels?.telegram;
	// null is an explicit clear; undefined (or blank) preserves the existing token.
	const botToken = input.botToken === null ? '' : optionalString(input.botToken);
	const allowedChatIds = input.allowedChatIds ?? existingTelegram?.allowedChatIds ?? [];
	const resolvedToken = botToken === undefined ? (existingTelegram?.botToken ?? '') : botToken;
	if (resolvedToken.length === 0 && allowedChatIds.length === 0) {
		// No meaningful config — clear the telegram block
		if (existing.channels?.telegram) {
			const channels = { ...existing.channels };
			delete channels.telegram;
			if (Object.keys(channels).length === 0) return undefined;
			return channels;
		}
		return existing.channels;
	}
	return {
		...existing.channels,
		telegram: {
			allowedChatIds,
			// Omitted rather than written as "": the file should never carry an empty credential
			// field, and a blank one here would read as a configured-but-broken token. The block
			// survives on allowedChatIds alone because AIDD_TELEGRAM_BOT_TOKEN may supply the
			// token at resolve time — see `shared/src/config/env-secrets.ts`.
			...(resolvedToken ? { botToken: resolvedToken } : {}),
		},
	};
}
