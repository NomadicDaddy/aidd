import { providerDefaults, type ProviderName } from './types.ts';

export interface ProviderCredential {
	/** The environment variable this provider accepts, for the missing-key message. */
	envVar: string;
	/** Its current value, or undefined when the variable is unset. */
	value: string | undefined;
}

/**
 * The provider-scoped credential variable each native provider accepts, paired with its value.
 *
 * A provider key is bound to its own provider and to nothing else: an ambient `ZHIPU_API_KEY` in
 * the shell must not authenticate an `xai` run, because that transmits a credential to a third
 * party that never issued it. Looking a provider up here is the only way the resolver reads one,
 * so there is no ordered fallback for a stray key to fall through.
 *
 * `satisfies Record<ProviderName, ...>` makes the table exhaustive: a provider added to
 * `providerDefaults` fails to compile until it declares which variable it accepts, or `null` for a
 * local provider that needs no credential.
 *
 * Each row names its variable twice — once as data for the error message, once as a literal
 * `env.NAME` read — deliberately. `test/scripts/env-key-registry.test.ts` scans source text for
 * environment reads and cannot follow a computed index, so `env[entry.envVar]` would drop every
 * provider key out of that registry. The two halves of a row are checked against each other by
 * `test/cli/agent-client.test.ts`, which drives each provider through the `envVar` it advertises.
 */
export function providerCredentials(
	env: NodeJS.ProcessEnv,
): Record<ProviderName, null | ProviderCredential> {
	return {
		lmstudio: null,
		ollama: null,
		openai: { envVar: 'OPENAI_API_KEY', value: env.OPENAI_API_KEY },
		xai: { envVar: 'XAI_API_KEY', value: env.XAI_API_KEY },
		zhipu: { envVar: 'ZHIPU_API_KEY', value: env.ZHIPU_API_KEY },
	} satisfies Record<ProviderName, null | ProviderCredential>;
}

/** True when `name` is one of the five providers that ship defaults. */
export function isProviderName(name: string | undefined): name is ProviderName {
	return name !== undefined && Object.hasOwn(providerDefaults, name);
}

/**
 * The provider credential available from the environment, or `undefined` when there is none.
 *
 * Mirrors the precedence in `resolveDefaultNativeClientConfig`: `NATIVE_API_KEY` is the deliberate
 * provider-agnostic override and keeps the head of the chain, and otherwise only the variable
 * bound to this provider counts. An unknown provider name has no bound variable and so has no
 * environment credential, which keeps a custom provider from picking up a key it was never issued.
 *
 * Every caller that needs a key reads it here, so the answer to "is one configured" and the value
 * that gets sent cannot disagree: `hasProviderEnvCredential` is this function's emptiness.
 */
export function providerEnvApiKey(
	provider: string,
	env: NodeJS.ProcessEnv = process.env,
): string | undefined {
	const override = env.NATIVE_API_KEY?.trim();
	if (override) return override;
	if (!isProviderName(provider)) return undefined;
	const scoped = providerCredentials(env)[provider]?.value?.trim();
	return scoped ? scoped : undefined;
}

/**
 * The environment variable a provider accepts, for a missing-key message.
 *
 * Read from the same table the resolver reads, so a message cannot come to advertise a variable
 * that would not in fact be accepted. The table is queried with an empty environment because only
 * the variable's name is wanted here, never its value.
 */
export function providerEnvVar(provider: string): string | undefined {
	if (!isProviderName(provider)) return undefined;
	return providerCredentials({})[provider]?.envVar;
}

/**
 * True when a provider credential is available from the environment rather than from
 * `providers.<name>.apiKey` in the config file.
 *
 * The settings layer needs this because a key kept out of the config file is exactly the
 * arrangement `config/env-secrets.ts` argues for, and a check that only reads the file would
 * report a working provider as unconfigured -- blocking a Direct AI save on a credential that
 * resolves fine at call time.
 */
export function hasProviderEnvCredential(
	provider: string,
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	return providerEnvApiKey(provider, env) !== undefined;
}
