import type { PartialAiddConfig } from 'aidd-shared/config';

import { assertSafeAgentBaseUrl } from 'aidd-shared';
import { hasProviderEnvCredential, providerDefaults } from 'aidd-shared/agent/client';
import { applicationRootSyntaxError } from 'aidd-shared/application-roots';
import { statSync } from 'node:fs';

import { optionalString } from './normalization.ts';

// Re-export the shared SSRF guard so existing callers (`settingsService.ts`) continue to
// import from this module. The canonical implementation lives in `shared/src/security`
// and is used by both the settings-write path and the outbound call path.
export { assertSafeAgentBaseUrl };

export function applicationRootsValidationError(
	applicationRoots: readonly string[],
): null | string {
	const syntaxError = applicationRootSyntaxError(applicationRoots);
	if (syntaxError) return syntaxError;
	for (const value of applicationRoots) {
		const root = value.trim();
		let entry: ReturnType<typeof statSync> | undefined;
		try {
			entry = statSync(root, { throwIfNoEntry: false });
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			return `Application root "${root}" could not be read: ${reason}`;
		}
		if (!entry) return `Application root "${root}" does not exist.`;
		if (!entry.isDirectory()) return `Application root "${root}" is not a directory.`;
	}
	return null;
}

export function assertValidApplicationRoots(applicationRoots: readonly string[]): void {
	const error = applicationRootsValidationError(applicationRoots);
	if (error) throw new Error(error);
}

export function knownDirectAiDefaults(
	provider: string,
): (typeof providerDefaults)[keyof typeof providerDefaults] | undefined {
	if (provider === 'zhipu') return providerDefaults.zhipu;
	if (provider === 'xai') return providerDefaults.xai;
	if (provider === 'openai') return providerDefaults.openai;
	if (provider === 'ollama') return providerDefaults.ollama;
	if (provider === 'lmstudio') return providerDefaults.lmstudio;
	return undefined;
}

export function assertDirectAiResolvable(next: PartialAiddConfig, provider: string): void {
	const directAi = next.directAi;
	if (!directAi?.enabled) return;
	const providerConfig = next.providers?.[provider];
	const defaults = knownDirectAiDefaults(provider);
	const baseUrl =
		optionalString(directAi.baseUrl) ??
		optionalString(providerConfig?.baseUrl) ??
		defaults?.baseUrl;
	if (!baseUrl) {
		throw new Error(
			`Direct AI provider "${provider}" requires a baseUrl. Set Direct AI base URL or configure providers.${provider}.baseUrl in config.json.`,
		);
	}
	assertSafeAgentBaseUrl(baseUrl, `Direct AI provider "${provider}"`);
	const model =
		optionalString(directAi.model) ?? optionalString(providerConfig?.model) ?? defaults?.model;
	if (!model) {
		throw new Error(
			`Direct AI provider "${provider}" requires a model. Set Direct AI model or configure providers.${provider}.model in config.json.`,
		);
	}
	if (defaults?.apiKeyRequired === true) {
		// The environment counts, and takes precedence at call time. Keeping the key out of
		// config.json is the recommended arrangement (see `shared/src/config/env-secrets.ts`),
		// so rejecting a save for a "missing" key that resolves fine would punish it.
		const apiKey = optionalString(providerConfig?.apiKey);
		if (!apiKey && !hasProviderEnvCredential(provider)) {
			throw new Error(
				`Direct AI provider "${provider}" requires an API key. Provide one in the Direct AI section, or set the provider's API key environment variable.`,
			);
		}
	}
}
