import { describe, expect, test } from 'bun:test';
import { providerDefaults, type ProviderName } from 'aidd-shared/agent/client';
import {
	type ProviderCredential,
	providerCredentials,
} from 'aidd-shared/agent/client/providerKeys';
import { resolveDirectAiCall } from 'aidd-shared/agent/directAi';
import { resolveMergedConfig } from 'aidd-shared/config';
import { disableAiCallLog } from 'aidd-shared/lib/aiCallLog';

disableAiCallLog();

// A Direct AI surface has to find an operator credential wherever the native client finds one.
// Keeping provider keys in the environment instead of `providers.<name>.apiKey` is the arrangement
// `config/env-secrets.ts` asks operators to adopt, and a resolver that reads the config file alone
// rejects a key that is in fact present: Director chat answered every message with
// `POST /api/v1/director/chat/.../messages (400): ... requires an API key`. These tests pin the
// precedence, and pin that a key still only ever authenticates the provider that issued it.

const credentials = providerCredentials({});
const keyed = (Object.keys(providerDefaults) as ProviderName[])
	.map((provider) => [provider, credentials[provider]] as const)
	.filter((entry): entry is readonly [ProviderName, ProviderCredential] => entry[1] !== null);

function configFor(provider: ProviderName, fileKey?: string) {
	return resolveMergedConfig({
		directAi: { enabled: true, provider },
		providers: { [provider]: fileKey === undefined ? {} : { apiKey: fileKey } },
	});
}

function resolvedKey(
	provider: ProviderName,
	env: NodeJS.ProcessEnv,
	fileKey?: string,
): string | undefined {
	return resolveDirectAiCall(configFor(provider, fileKey), { surface: 'directorChat' }, env)
		.config.apiKey;
}

function rejectionMessage(provider: ProviderName, env: NodeJS.ProcessEnv): string {
	try {
		resolveDirectAiCall(configFor(provider), { surface: 'directorChat' }, env);
	} catch (err) {
		return (err as Error).message;
	}
	throw new Error(`expected ${provider} to reject a call with no API key anywhere`);
}

function expectedRejection(provider: ProviderName, envVar: string): string {
	return (
		`Direct AI provider "${provider}" requires an API key. ` +
		`Set ${envVar} (or NATIVE_API_KEY) in the environment, ` +
		`or add providers.${provider}.apiKey to the config file.`
	);
}

describe('Direct AI provider credentials', () => {
	test('every provider that requires a key resolves it from its own environment variable', () => {
		expect(keyed.length).toBeGreaterThan(1);
		for (const [provider, credential] of keyed) {
			const resolved = resolvedKey(provider, { [credential.envVar]: `${provider}-key` });
			expect([provider, resolved]).toEqual([provider, `${provider}-key`]);
		}
	});

	test('precedence is NATIVE_API_KEY, then the provider variable, then the config file', () => {
		for (const [provider, credential] of keyed) {
			const both = { NATIVE_API_KEY: 'native', [credential.envVar]: 'own' };
			expect([provider, resolvedKey(provider, both, 'file')]).toEqual([provider, 'native']);
			expect([
				provider,
				resolvedKey(provider, { [credential.envVar]: 'own' }, 'file'),
			]).toEqual([provider, 'own']);
			expect([provider, resolvedKey(provider, {}, 'file')]).toEqual([provider, 'file']);
		}
	});

	test('a blank environment variable falls through to the config file', () => {
		for (const [provider, credential] of keyed) {
			const resolved = resolvedKey(provider, { [credential.envVar]: '   ' }, 'file');
			expect([provider, resolved]).toEqual([provider, 'file']);
		}
	});

	test('another provider key in the environment is refused, not borrowed', () => {
		for (const [provider, credential] of keyed) {
			const foreignKeys: NodeJS.ProcessEnv = {};
			for (const [other, otherCredential] of keyed) {
				if (other !== provider) foreignKeys[otherCredential.envVar] = `${other}-key`;
			}
			expect([provider, rejectionMessage(provider, foreignKeys)]).toEqual([
				provider,
				expectedRejection(provider, credential.envVar),
			]);
		}
	});

	test('the missing-key message names the variable the provider actually accepts', () => {
		for (const [provider, credential] of keyed) {
			expect([provider, rejectionMessage(provider, {})]).toEqual([
				provider,
				expectedRejection(provider, credential.envVar),
			]);
		}
	});
});
