import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { reapRunWorktree } from '../../backend/src/services/run/worktreeReap.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

import { testTempDir } from '../_helpers/temp.ts';
async function runGit(cwd: string, args: string[]): Promise<string> {
	const proc = Bun.spawn(['git', '-C', cwd, ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	const [out, errText, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (code !== 0) throw new Error(`git ${args.join(' ')} failed: ${errText || out}`);
	return out.trim();
}

describe('reapRunWorktree', () => {
	test('removes the worktree dir and its branch', async () => {
		const root = await testTempDir('aidd-reap-test-');
		try {
			const projectDir = join(root, 'project');
			await mkdir(projectDir, { recursive: true });
			await runGit(projectDir, ['init', '-b', 'main']);
			await runGit(projectDir, ['config', 'user.email', 'test@aidd.local']);
			await runGit(projectDir, ['config', 'user.name', 'aidd test']);
			await writeFile(join(projectDir, 'file.txt'), 'base\n');
			await runGit(projectDir, ['add', '.']);
			await runGit(projectDir, ['commit', '-m', 'base']);

			const worktreePath = join(root, 'wt', 'run1');
			const branch = 'aidd/run-run1';
			await runGit(projectDir, ['worktree', 'add', '-b', branch, worktreePath]);
			expect(existsSync(worktreePath)).toBe(true);

			await reapRunWorktree(projectDir, worktreePath, branch);

			expect(existsSync(worktreePath)).toBe(false);
			expect(await runGit(projectDir, ['branch', '--list', branch])).toBe('');
		} finally {
			await removeTempTree(root);
		}
	});

	test('is a no-op-safe best effort when the worktree is already gone', async () => {
		const root = await testTempDir('aidd-reap-test-');
		try {
			const projectDir = join(root, 'project');
			await mkdir(projectDir, { recursive: true });
			await runGit(projectDir, ['init', '-b', 'main']);
			// Never created — reap must not throw.
			await reapRunWorktree(projectDir, join(root, 'wt', 'missing'), 'aidd/run-missing');
		} finally {
			await removeTempTree(root);
		}
	});
});
