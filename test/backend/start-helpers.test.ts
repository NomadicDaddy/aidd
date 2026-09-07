import { describe, expect, spyOn, test } from 'bun:test';
import type { ResolvedConfig } from 'aidd-shared/config';
import { WEB_AUTH_TOKEN_ENV } from 'aidd-shared/config';
import { webLogger } from '../../backend/src/logger.ts';
import {
	assertWebAuthTokenPresent,
	createRestartSupervisorSpawnOptions,
	resolveEffectiveWebConfig,
	warnRemoteAccess,
} from '../../backend/src/startHelpers.ts';

function webConfig(
	overrides: Partial<NonNullable<ResolvedConfig['web']>> = {},
): NonNullable<ResolvedConfig['web']> {
	return {
		...resolveEffectiveWebConfig({} as ResolvedConfig, 'D:/applications/aidd'),
		...overrides,
	};
}

describe('web start helpers', () => {
	test('spawns restart supervisor with explicit detached Windows-safe options', () => {
		const options = createRestartSupervisorSpawnOptions('D:/applications/aidd', 1, 2);

		expect(options).toEqual({
			cwd: 'D:/applications/aidd',
			detached: true,
			stderr: 2,
			stdin: 'ignore',
			stdout: 1,
			windowsHide: true,
		});
	});

	test('warns both channels that remote access is token-protected', () => {
		const structuredWarn = spyOn(webLogger, 'warn').mockImplementation(() => {});
		const consoleWarn = spyOn(console, 'warn').mockImplementation(() => {});

		try {
			warnRemoteAccess('0.0.0.0', 3210);

			expect(structuredWarn).toHaveBeenCalledTimes(1);
			expect(structuredWarn.mock.calls[0]?.[0]).toEqual({
				hostname: '0.0.0.0',
				port: 3210,
			});
			expect(consoleWarn).toHaveBeenCalledTimes(1);

			const messages = [
				String(structuredWarn.mock.calls[0]?.[1] ?? ''),
				String(consoleWarn.mock.calls[0]?.[0] ?? ''),
			];
			for (const message of messages) {
				expect(message).toContain('token-protected');
				expect(message).toContain('web.authToken');
				expect(message).toContain('web.allowedOrigins');
				expect(message.toLowerCase()).not.toContain('unauthenticated');
			}
			expect(messages[1]).toContain('http://0.0.0.0:3210');
		} finally {
			structuredWarn.mockRestore();
			consoleWarn.mockRestore();
		}
	});
});

describe('assertWebAuthTokenPresent', () => {
	test('refuses to start a remote-bound panel with no token', () => {
		// Without this the panel would bind to the network and serve it: `isPeerAuthorized`
		// holds a tokenless panel to loopback, but nothing else would say why it is useless.
		expect(() => assertWebAuthTokenPresent(webConfig({ allowRemote: true }))).toThrow(
			/web\.authToken is missing or blank/,
		);
		expect(() =>
			assertWebAuthTokenPresent(webConfig({ allowRemote: true, authToken: '   ' })),
		).toThrow(/web\.authToken is missing or blank/);
	});

	test('the failure names the environment variable, not just the config field', () => {
		// This message is the last thing a blocked operator reads before deciding where to put
		// the token, and it is read at exactly the moment the panel will not start. Naming only
		// `web.authToken` sends them to ~/.aidd/config.json, which resolves the outage and
		// silently undoes the indirection -- no gate inspects that file, so nothing would ever
		// report it. That happened once; this pins the fix.
		let message = '';
		try {
			assertWebAuthTokenPresent(webConfig({ allowRemote: true }));
		} catch (err) {
			message = (err as Error).message;
		}
		expect(message).toContain(WEB_AUTH_TOKEN_ENV);
		expect(message).toContain('rather than writing it into');
	});

	test('says nothing about a loopback panel or a remote panel that has its token', () => {
		expect(() => assertWebAuthTokenPresent(webConfig())).not.toThrow();
		expect(() =>
			assertWebAuthTokenPresent(webConfig({ allowRemote: true, authToken: 'panel-token' })),
		).not.toThrow();
	});
});
