import { describe, expect, test } from 'bun:test';
import {
	applyEnvSecrets,
	resolveMergedConfig,
	TELEGRAM_BOT_TOKEN_ENV,
	WEB_AUTH_TOKEN_ENV,
} from 'aidd-shared/config';
import type { PartialAiddConfig } from 'aidd-shared/config';

import {
	buildBackendSubprocessEnv,
	buildToolSubprocessEnv,
} from '../../shared/src/subprocess-env.ts';

/**
 * These cover the reason the overlay exists: a credential kept in `~/.aidd/config.json` is
 * readable by any agent that can run a shell command, and the whole file travels into the
 * model provider's context when one reads it. The overlay lets the file hold no credential.
 */

const noEnv: NodeJS.ProcessEnv = {};

describe('applyEnvSecrets', () => {
	test('supplies web.authToken when the file has none', () => {
		const result = applyEnvSecrets({}, { [WEB_AUTH_TOKEN_ENV]: 'env-web-token' });
		expect(result.web?.authToken).toBe('env-web-token');
	});

	test('environment wins over a stale file value', () => {
		const config: PartialAiddConfig = { web: { authToken: 'file-token', port: 4317 } };
		const result = applyEnvSecrets(config, { [WEB_AUTH_TOKEN_ENV]: 'env-token' });
		expect(result.web?.authToken).toBe('env-token');
		// Non-secret siblings survive the overlay.
		expect(result.web?.port).toBe(4317);
	});

	test('blank and whitespace-only variables do not shadow a configured value', () => {
		const config: PartialAiddConfig = { web: { authToken: 'file-token' } };
		expect(applyEnvSecrets(config, { [WEB_AUTH_TOKEN_ENV]: '' }).web?.authToken).toBe(
			'file-token',
		);
		expect(applyEnvSecrets(config, { [WEB_AUTH_TOKEN_ENV]: '   ' }).web?.authToken).toBe(
			'file-token',
		);
	});

	test('overlays a declared telegram channel', () => {
		const config: PartialAiddConfig = {
			channels: { telegram: { allowedChatIds: [42] } },
		};
		const result = applyEnvSecrets(config, { [TELEGRAM_BOT_TOKEN_ENV]: 'env-bot' });
		expect(result.channels?.telegram?.botToken).toBe('env-bot');
		expect(result.channels?.telegram?.allowedChatIds).toEqual([42]);
	});

	test('does not synthesize a telegram channel the config never declared', () => {
		// A bot token alone cannot enable the bridge: allowedChatIds decides who may talk to
		// it, and an empty list would start a bridge that ignores every message.
		const result = applyEnvSecrets({}, { [TELEGRAM_BOT_TOKEN_ENV]: 'env-bot' });
		expect(result.channels).toBeUndefined();
	});

	test('does not mutate the caller-held config', () => {
		const config: PartialAiddConfig = { web: { authToken: 'file-token' } };
		applyEnvSecrets(config, { [WEB_AUTH_TOKEN_ENV]: 'env-token' });
		expect(config.web?.authToken).toBe('file-token');
	});

	test('returns the same object when no secret variable is set', () => {
		const config: PartialAiddConfig = { web: { port: 4317 } };
		expect(applyEnvSecrets(config, noEnv)).toBe(config);
	});
});

describe('environment-supplied credentials stay out of agent reach', () => {
	// This is the property that makes the overlay worth anything. Moving a credential from
	// the config file into a variable that is then handed to the spawned agent would trade
	// one readable location for another. Neither variable names a backend requirement, so
	// neither belongs in the allowlist — a future entry here must be deliberate.
	test('neither variable is forwarded to a backend CLI subprocess', () => {
		const parentEnv = {
			[TELEGRAM_BOT_TOKEN_ENV]: 'probe-bot',
			[WEB_AUTH_TOKEN_ENV]: 'probe-web',
		};
		const backendEnv = buildBackendSubprocessEnv({}, parentEnv);
		expect(backendEnv[WEB_AUTH_TOKEN_ENV]).toBeUndefined();
		expect(backendEnv[TELEGRAM_BOT_TOKEN_ENV]).toBeUndefined();
		expect(Object.values(backendEnv)).not.toContain('probe-web');
		expect(Object.values(backendEnv)).not.toContain('probe-bot');
	});

	test('neither variable is forwarded to an agent tool subprocess', () => {
		const toolEnv = buildToolSubprocessEnv({
			[TELEGRAM_BOT_TOKEN_ENV]: 'probe-bot',
			[WEB_AUTH_TOKEN_ENV]: 'probe-web',
		});
		expect(toolEnv[WEB_AUTH_TOKEN_ENV]).toBeUndefined();
		expect(toolEnv[TELEGRAM_BOT_TOKEN_ENV]).toBeUndefined();
	});
});

describe('resolveMergedConfig with an environment-supplied credential', () => {
	test('an env-supplied token satisfies the allowRemote requirement', () => {
		const config = applyEnvSecrets(
			{ web: { allowRemote: true, hostname: '0.0.0.0' } },
			{ [WEB_AUTH_TOKEN_ENV]: 'env-token' },
		);
		expect(resolveMergedConfig(config).web?.authToken).toBe('env-token');
	});

	test('allowRemote with no token anywhere still resolves, because reading is not serving', () => {
		// Resolution used to throw here, and it took out processes that serve nothing. Every aidd
		// process resolves this same config, including the CLI a run spawns -- and that CLI is
		// handed an environment with no `AIDD_WEB_AUTH_TOKEN` on purpose (see `subprocess-env.ts`,
		// which withholds it so a coding CLI never receives the operator's credential). With the
		// token moved out of `config.json`, every detached run died at startup against an
		// `allowRemote` config it had no business enforcing. The requirement is a precondition of
		// listening, so `assertWebAuthTokenPresent` enforces it where the panel binds.
		const resolved = resolveMergedConfig(
			applyEnvSecrets({ web: { allowRemote: true, hostname: '0.0.0.0' } }, noEnv),
		);
		expect(resolved.web?.allowRemote).toBe(true);
		expect(resolved.web?.authToken).toBeUndefined();
	});

	test('a CLI given the real subprocess environment can resolve an allowRemote config', () => {
		// The regression in its own terms: this is the environment `buildBackendSubprocessEnv`
		// hands a detached run, and the config that run reads off disk.
		const subprocessEnv = buildBackendSubprocessEnv(
			{},
			{ [WEB_AUTH_TOKEN_ENV]: 'panel-token' },
		);
		expect(subprocessEnv[WEB_AUTH_TOKEN_ENV]).toBeUndefined();
		expect(() =>
			resolveMergedConfig(
				applyEnvSecrets({ web: { allowRemote: true, hostname: '0.0.0.0' } }, subprocessEnv),
			),
		).not.toThrow();
	});

	test('a telegram section with no token anywhere resolves as unconfigured', () => {
		// Better than handing the bridge a blank token it would send to api.telegram.org
		// on every poll.
		const resolved = resolveMergedConfig(
			applyEnvSecrets({ channels: { telegram: { allowedChatIds: [42] } } }, noEnv),
		);
		expect(resolved.channels).toBeUndefined();
	});

	test('a whitespace-only file token resolves as unconfigured', () => {
		const resolved = resolveMergedConfig({
			channels: { telegram: { allowedChatIds: [42], botToken: '   ' } },
		});
		expect(resolved.channels).toBeUndefined();
	});

	test('an env-supplied bot token resolves the bridge', () => {
		const resolved = resolveMergedConfig(
			applyEnvSecrets(
				{ channels: { telegram: { allowedChatIds: [42] } } },
				{ [TELEGRAM_BOT_TOKEN_ENV]: 'env-bot' },
			),
		);
		expect(resolved.channels?.telegram?.botToken).toBe('env-bot');
	});
});
