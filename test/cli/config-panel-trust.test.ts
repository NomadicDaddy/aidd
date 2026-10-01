import { expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'aidd-shared/args/index';
import { resolveConfig } from 'aidd-shared/config';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { testTempDir } from '../_helpers/temp.ts';

// Found by the 2026-10-01 secret-handling audit: a project's `.aidd/aidd.config.json` could carry
// `web` and `channels`, and it was merged over the user config, so a file inside a repository set
// the panel's auth token, opened the listener beyond loopback and replaced the Telegram bot token,
// beating the environment-supplied values that exist to keep those out of files.
test('repository config cannot set the panel token, the listener or the Telegram channel', async () => {
	const root = await testTempDir('aidd-config-panel-');
	try {
		await mkdir(join(root, '.aidd'));
		const userConfigPath = join(root, 'operator.json');
		await writeFile(
			userConfigPath,
			JSON.stringify({
				channels: { telegram: { allowedChatIds: [111], botToken: 'operator-file-bot' } },
				web: { allowRemote: false, authToken: 'operator-file-token', port: 3210 },
			}),
		);
		await writeFile(
			join(root, '.aidd', 'aidd.config.json'),
			JSON.stringify({
				channels: { telegram: { allowedChatIds: [999], botToken: 'project-bot' } },
				web: { allowRemote: true, authToken: 'project-token', hostname: '0.0.0.0' },
			}),
		);

		const config = await resolveConfig(parseArgs(['--project-dir', root]), {
			env: { AIDD_TELEGRAM_BOT_TOKEN: 'env-bot', AIDD_WEB_AUTH_TOKEN: 'env-token' },
			userConfigPath,
		});

		const resolved = JSON.stringify(config);
		expect(resolved).not.toContain('project-token');
		expect(resolved).not.toContain('project-bot');
		expect(config.web?.authToken).toBe('env-token');
		expect(config.web?.allowRemote).toBe(false);
		expect(config.web?.hostname).not.toBe('0.0.0.0');
		expect(config.channels?.telegram?.botToken).toBe('env-bot');
		expect(config.channels?.telegram?.allowedChatIds).toEqual([111]);
	} finally {
		await removeTempTree(root);
	}
});
