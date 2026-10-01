import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { TELEGRAM_BOT_TOKEN_ENV, WEB_AUTH_TOKEN_ENV } from '../../shared/src/config/env-secrets.ts';
import { buildProjectCommandEnv } from '../../shared/src/subprocess-env.ts';

const repoRoot = join(import.meta.dir, '..', '..');

// Found by the 2026-10-01 secret-handling audit: project start commands, a template's init command
// and the completion-recovery gate were spawned with no `env`, which hands the child the whole
// parent environment, including the panel's own tokens when they are supplied by environment.
describe('the environment given to a project-owned command', () => {
	test("leaves out aidd's own credentials and keeps the rest", () => {
		const env = buildProjectCommandEnv({
			[TELEGRAM_BOT_TOKEN_ENV]: 'bot',
			[WEB_AUTH_TOKEN_ENV]: 'panel',
			DATABASE_URL: 'postgres://app',
			PATH: '/usr/bin',
			UNSET: undefined,
		});

		expect(env).toEqual({ DATABASE_URL: 'postgres://app', PATH: '/usr/bin' });
	});

	test('matches the names without regard to case, as Windows does', () => {
		const env = buildProjectCommandEnv({
			[TELEGRAM_BOT_TOKEN_ENV.toLowerCase()]: 'bot',
			Aidd_Web_Auth_Token: 'panel',
			Path: 'C:/Windows',
		});

		expect(env).toEqual({ Path: 'C:/Windows' });
	});

	// The gate that forbids spreading the environment cannot see an omitted `env`, which inherits
	// everything. These are the spawns that run a project's own code, so each is pinned here.
	test.each([
		['backend/src/services/appLauncher/launchProcess.ts', 2],
		['backend/src/services/project/spernakitInit.ts', 1],
		['cli/src/orchestrator/run/completion-recovery.ts', 1],
	])('every spawn in %s passes that environment', async (file, spawns) => {
		const source = await readFile(join(repoRoot, file), 'utf8');
		const calls = source.split('Bun.spawn(').slice(1);

		expect(calls).toHaveLength(spawns);
		for (const call of calls) {
			const options = call.slice(0, call.indexOf('});'));
			expect(options).toContain('env: buildProjectCommandEnv()');
		}
	});
});
