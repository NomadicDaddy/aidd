import type { PartialAiddConfig } from 'aidd-shared/config';

import type { ProviderSettingsInput } from './types.ts';

import { optionalString } from './normalization.ts';

/** Managed fields that the settings UI controls and that the merge logic below
 * replaces individually. Every other key on a provider entry (e.g. `stream`,
 * `streamIdleTimeoutMs`) is treated as unmanaged and carried forward verbatim. */
const managedProviderFields = new Set(['apiKey', 'baseUrl', 'model', 'reasoningEffort']);

/** Merge provider input into existing, preserving apiKeys when the input leaves them blank.
 *
 * Also preserves:
 * - Providers that exist in config but are absent from the input (the frontend always sends
 *   the full set, but other callers may not).
 * - Provider-specific fields the settings UI does not manage (e.g. `stream`,
 *   `streamIdleTimeoutMs`) — these are JSON-config-only controls and must survive a
 *   settings save rather than being silently dropped.
 *
 * @param input - The provider settings input map.
 * @param existing - The existing provider config.
 * @returns Merged provider config.
 */
export function mergeProviders(
	input: Record<string, ProviderSettingsInput>,
	existing: PartialAiddConfig['providers']
): NonNullable<PartialAiddConfig['providers']> {
	// Start with a shallow copy of existing so providers absent from the input and
	// provider-specific fields the frontend doesn't manage survive a settings save.
	const merged: NonNullable<PartialAiddConfig['providers']> = { ...(existing ?? {}) };
	for (const [name, providerInput] of Object.entries(input)) {
		const existingProvider = existing?.[name] ?? {};
		// Carry forward unmanaged fields (stream, streamIdleTimeoutMs, etc.) from the
		// existing entry; managed fields below overwrite these when present.
		const unmanaged: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(existingProvider)) {
			if (!managedProviderFields.has(key)) unmanaged[key] = value;
		}
		const normalized: NonNullable<PartialAiddConfig['providers']>[string] = { ...unmanaged };
		// model: undefined preserves existing, null/blank clears, non-blank string sets
		if (providerInput.model !== undefined) {
			const model = optionalString(providerInput.model);
			if (model !== undefined) normalized.model = model;
		} else if (existingProvider.model !== undefined) {
			normalized.model = existingProvider.model;
		}
		// baseUrl: same semantics as model
		if (providerInput.baseUrl !== undefined) {
			const baseUrl = optionalString(providerInput.baseUrl);
			if (baseUrl !== undefined) normalized.baseUrl = baseUrl;
		} else if (existingProvider.baseUrl !== undefined) {
			normalized.baseUrl = existingProvider.baseUrl;
		}
		// reasoningEffort: undefined preserves existing, null clears, value sets
		if (providerInput.reasoningEffort !== undefined) {
			if (providerInput.reasoningEffort !== null) {
				normalized.reasoningEffort = providerInput.reasoningEffort;
			}
		} else if (existingProvider.reasoningEffort !== undefined) {
			normalized.reasoningEffort = existingProvider.reasoningEffort;
		}
		// apiKey handling: preserve existing key when input is undefined or blank
		if (providerInput.apiKey === null) {
			// Explicit clear: do not carry over the key
		} else if (typeof providerInput.apiKey === 'string' && providerInput.apiKey.trim()) {
			normalized.apiKey = providerInput.apiKey.trim();
		} else if (existingProvider.apiKey) {
			normalized.apiKey = existingProvider.apiKey;
		}
		merged[name] = normalized;
	}
	return merged;
}
