import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { testTempDir } from '../_helpers/temp.ts';

const cliEntry = resolve(import.meta.dir, '../../cli/src/index.ts');

function git(cwd: string, args: string[]): string {
	const result = Bun.spawnSync(['git', ...args], {
		cwd,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	return result.stdout.toString().trim();
}

// A project with a committed aidd contract and a clean tree: what a pre-code project looks like when
// someone asks aidd to check it.
async function cleanProject(): Promise<string> {
	const dir = await testTempDir('aidd-validate-no-writes-');
	await mkdir(join(dir, '.aidd', 'features'), { recursive: true });
	await writeFile(join(dir, '.aidd', 'spec.md'), '# Spec\n');
	await writeFile(join(dir, 'README.md'), '# Fixture\n');
	// The runtime and generated .aidd classes every aidd project ignores (docs/reference/artifacts.md);
	// a validate run legitimately appends the run ledger and writes the artifact report.
	await writeFile(join(dir, '.gitignore'), '.aidd/runs.jsonl\n.aidd/.artifacts-check.json\n');
	git(dir, ['init', '-q']);
	git(dir, ['config', 'user.email', 'fixture@example.invalid']);
	git(dir, ['config', 'user.name', 'Fixture']);
	git(dir, ['add', '-A']);
	git(dir, ['commit', '-q', '-m', 'init', '--no-verify']);
	return dir;
}

// The real incident: a --check-features / --check-artifacts run against sigilsunseen installed the
// history guard, which copied .githooks into the repo, staged the files and set core.hooksPath.
// A validate run is a read (BEH-006) and must leave the project's git state exactly as it found it.
describe('validate mode leaves the checked project alone', () => {
	for (const flag of ['--check-features', '--check-artifacts']) {
		test(`${flag} installs no hooks and stages nothing`, async () => {
			const dir = await cleanProject();
			Bun.spawnSync(['bun', cliEntry, '--project-dir', dir, flag], {
				stderr: 'pipe',
				stdout: 'pipe',
				windowsHide: true,
			});
			expect(existsSync(join(dir, '.githooks'))).toBe(false);
			expect(git(dir, ['config', '--get', 'core.hooksPath'])).toBe('');
			expect(git(dir, ['status', '--porcelain'])).toBe('');
		}, 60_000);
	}
});
