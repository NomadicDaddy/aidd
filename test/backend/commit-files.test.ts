import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { commitFiles } from '../../backend/src/services/git/commitFiles.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { importPath, runWithoutGit } from '../_helpers/without-git.ts';

// commitFiles runs after a web report has already written its feature record, so every failure
// must come back as a reason, never a throw, and must not leave the record staged for somebody
// else's next commit.

async function git(dir: string, args: string[]): Promise<string> {
	const proc = Bun.spawn(['git', '-C', dir, ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	const out = await new Response(proc.stdout).text();
	if ((await proc.exited) !== 0) throw new Error(`git ${args.join(' ')} failed`);
	return out;
}

const commitModule = resolve(import.meta.dir, '../../backend/src/services/git/commitFiles.ts');

describe('commitFiles', () => {
	test('reports a reason instead of throwing when git is not installed', async () => {
		const dir = await testTempDir('aidd-commit-files-nogit-');
		try {
			const result = await runWithoutGit(
				[
					`const { commitFiles } = await import(${importPath(commitModule)});`,
					`console.log(JSON.stringify(await commitFiles(${importPath(dir)}, ['a.json'], 'm')));`,
				].join('\n'),
			);
			expect(result.code).toBe(0);
			expect(JSON.parse(result.stdout)).toEqual({ committed: false, reason: 'not-a-repo' });
		} finally {
			await removeTempTree(dir);
		}
	});

	test('unstages its paths when the commit is refused', async () => {
		const dir = await testTempDir('aidd-commit-files-refused-');
		try {
			await git(dir, ['init', '-q']);
			await git(dir, ['config', 'user.email', 'test@aidd.local']);
			await git(dir, ['config', 'user.name', 'aidd test']);
			await git(dir, ['config', 'commit.gpgsign', 'false']);
			await writeFile(join(dir, 'base.txt'), 'base\n');
			await git(dir, ['add', '-A']);
			await git(dir, ['commit', '-q', '-m', 'baseline']);
			await git(dir, ['config', 'core.hooksPath', '.hooks']);
			await mkdir(join(dir, '.hooks'), { recursive: true });
			await writeFile(join(dir, '.hooks', 'pre-commit'), '#!/bin/sh\nexit 1\n', {
				mode: 0o755,
			});
			await writeFile(join(dir, 'report.json'), '{"id":"r"}\n');

			const result = await commitFiles(dir, ['report.json'], 'chore: report');

			expect(result).toEqual({ committed: false, reason: 'commit-failed' });
			expect((await git(dir, ['diff', '--cached', '--name-only'])).trim()).toBe('');
		} finally {
			await removeTempTree(dir);
		}
	});
});
