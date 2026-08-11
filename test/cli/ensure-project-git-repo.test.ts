import { afterEach, describe, expect, test } from 'bun:test';

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { ensureProjectGitRepo } from '../../cli/src/metadata/git.ts';

import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
const dirs: string[] = [];

afterEach(async () => {
	for (const dir of dirs.splice(0)) {
		await removeTempTree(dir);
	}
});

async function tempDir(): Promise<string> {
	const dir = await testTempDir('aidd-git-');
	dirs.push(dir);
	return dir;
}

describe('ensureProjectGitRepo', () => {
	// A clean machine (e.g. the standalone install target) may have no git. Post-scaffold git init
	// must skip rather than throw, or the whole run dies before it can write its first heartbeat.
	test('skips gracefully when git is not installed', async () => {
		const dir = await tempDir();
		const missingGit = async () => ({
			exitCode: -1,
			missing: true,
			ok: false,
			stderr: '',
			stdout: '',
		});
		expect(await ensureProjectGitRepo(dir, missingGit)).toBe('skipped');
	});

	test('initializes a fresh repo, then reports it present, when git is available', async () => {
		const dir = await tempDir();
		expect(await ensureProjectGitRepo(dir)).toBe('initialized');
		expect(await ensureProjectGitRepo(dir)).toBe('present');
	});

	// A FRESH project reaches ensureMetadata before it has a repository, so the guard cannot install
	// there — git init is the second seam, and without it the one lane that inits its own git would
	// be the only lane left unguarded.
	test('installs and wires the history guard once the fresh repo exists', async () => {
		const dir = await tempDir();
		expect(await ensureProjectGitRepo(dir)).toBe('initialized');

		const cfg = Bun.spawnSync(['git', '-C', dir, 'config', 'core.hooksPath'], {
			windowsHide: true,
		});
		expect(new TextDecoder().decode(cfg.stdout).trim()).toBe('.githooks');
		expect(existsSync(join(dir, '.githooks', 'pre-push'))).toBe(true);

		// Only the INDEX mode survives a clone; the on-disk bit is ignored under core.fileMode=false.
		const ls = Bun.spawnSync(['git', '-C', dir, 'ls-files', '-s', '.githooks/pre-push'], {
			windowsHide: true,
		});
		expect(new TextDecoder().decode(ls.stdout).trim().split(/\s+/)[0]).toBe('100755');
	});
});
