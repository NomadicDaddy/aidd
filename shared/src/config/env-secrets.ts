import type { PartialAiddConfig } from './schema.ts';

/**
 * Environment-sourced credential overlay for the user-level config.
 *
 * Credentials written into `~/.aidd/config.json` are readable by any agent that can run a
 * shell command, and that file is the one every doc names as *the* configuration file. An
 * agent asked to inspect configuration reads the whole thing — `Get-Content -Raw config.json`
 * returns the credentials with it, and the tool result travels into the model provider's
 * context. Scrubbing protects the log written to disk; it cannot recall a tool result. These
 * variables let the file carry no credential at all, which is the only thing that does.
 *
 * Environment wins over the file so a rotated value takes effect without editing config, and
 * a stale file value cannot silently shadow it.
 *
 * Only the user-level config is overlaid. A project `aidd.config.json` must never supply
 * credentials — see `restrictProjectConfig` in `read.ts`.
 *
 * Provider API keys are deliberately absent here: `agent/client/config.ts` already resolves
 * `NATIVE_API_KEY` and the provider-scoped keys in `agent/client/providerKeys.ts` ahead of
 * `providers.<name>.apiKey`. Overlaying them again would give one variable two precedence
 * rules that could disagree.
 */

/** Supplies `web.authToken`. Not forwarded to backend CLIs — see `subprocess-env.ts`. */
export const WEB_AUTH_TOKEN_ENV = 'AIDD_WEB_AUTH_TOKEN';

/** Supplies `channels.telegram.botToken`. Not forwarded to backend CLIs. */
export const TELEGRAM_BOT_TOKEN_ENV = 'AIDD_TELEGRAM_BOT_TOKEN';

/**
 * Blank and whitespace-only are treated as unset. An exported-but-empty variable is the normal
 * shape of a shell profile that has not been filled in yet, and letting it through would shadow
 * a working file value with a credential that cannot authenticate anything.
 *
 * Takes the value rather than the variable name so each read site names its constant literally:
 * `test/scripts/env-key-registry.test.ts` scans for environment reads and fails on one it cannot
 * resolve, which is what keeps a key from arriving unregistered.
 */
function readSecret(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

/**
 * Returns `config` with any environment-supplied credential applied over the file's value.
 *
 * The input is never mutated: callers hold a parsed config that other code also reads.
 */
export function applyEnvSecrets(
	config: PartialAiddConfig,
	env: NodeJS.ProcessEnv = process.env,
): PartialAiddConfig {
	const webAuthToken = readSecret(env[WEB_AUTH_TOKEN_ENV]);
	const telegramBotToken = readSecret(env[TELEGRAM_BOT_TOKEN_ENV]);
	if (!webAuthToken && !telegramBotToken) return config;

	const next: PartialAiddConfig = { ...config };
	if (webAuthToken) {
		next.web = { ...config.web, authToken: webAuthToken };
	}
	// Only overlay a channel the config already declares. The bot token alone cannot enable
	// the bridge — `allowedChatIds` decides who may talk to it, and synthesizing an empty
	// list here would start a bridge that ignores every message it receives.
	if (telegramBotToken && config.channels?.telegram) {
		next.channels = {
			...config.channels,
			telegram: { ...config.channels.telegram, botToken: telegramBotToken },
		};
	}
	return next;
}
