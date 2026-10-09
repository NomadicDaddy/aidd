import type { ParsedArgs } from 'aidd-shared/args/index';

import { resolveConfig } from 'aidd-shared/config';
import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runStageCommand } from '../../cli/src/commands/stage.ts';
import { testTempDir } from '../_helpers/temp.ts';

const rootDir = join(import.meta.dir, '..', '..');

// An empty user config, so the test never reads this machine's ~/.aidd/config.json (whose shared
// dirs or files would otherwise be copied into the fixture).
async function emptyConfigLoader(): Promise<
	(args: ParsedArgs) => ReturnType<typeof resolveConfig>
> {
	const dir = await testTempDir('stage-config-');
	const userConfigPath = join(dir, 'config.json');
	await writeFile(userConfigPath, '{}\n');
	return (args) => resolveConfig(args, { baseDir: rootDir, env: {}, userConfigPath });
}

describe('aidd stage', () => {
	test('stages a skill’s references and sibling contracts without touching git', async () => {
		const projectDir = await testTempDir('stage-project-');
		const loadConfig = await emptyConfigLoader();

		const code = await runStageCommand(
			['--project-dir', projectDir, '--skill', 'refresh-project-artifacts'],
			rootDir,
			loadConfig,
		);

		expect(code).toBe(0);
		const aidd = join(projectDir, '.aidd');
		expect(existsSync(join(aidd, 'docs', 'reference', 'artifacts.md'))).toBe(true);
		expect(existsSync(join(aidd, 'skills', 'review-or-create-doc', 'SKILL.md'))).toBe(true);
		// Staging is not a run: no hooks, no repository, nothing claimed.
		expect(existsSync(join(projectDir, '.githooks'))).toBe(false);
		expect(existsSync(join(projectDir, '.git'))).toBe(false);
		expect(existsSync(join(aidd, 'features'))).toBe(true);
	});

	test('refuses an unknown skill with exit 1 and a missing --project-dir with exit 2', async () => {
		const projectDir = await testTempDir('stage-project-');
		const loadConfig = await emptyConfigLoader();
		expect(
			await runStageCommand(
				['--project-dir', projectDir, '--skill', 'no-such-skill'],
				rootDir,
				loadConfig,
			),
		).toBe(1);
		expect(
			await runStageCommand(['--skill', 'refresh-project-artifacts'], rootDir, loadConfig),
		).toBe(2);
	});

	test('refuses a project directory that does not exist', async () => {
		const missing = join(await testTempDir('stage-missing-'), 'not-here');
		const loadConfig = await emptyConfigLoader();
		expect(await runStageCommand(['--project-dir', missing], rootDir, loadConfig)).toBe(1);
		expect(existsSync(missing)).toBe(false);
	});
});
