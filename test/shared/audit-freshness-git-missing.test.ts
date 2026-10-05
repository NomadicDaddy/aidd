import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { importPath, runWithoutGit } from '../_helpers/without-git.ts';

const gitModule = resolve(import.meta.dir, '../../shared/src/metadata/audit-freshness/git.ts');

describe('audit freshness on a machine without git', () => {
	test('reports no HEAD and no worktree instead of throwing', async () => {
		const dir = await testTempDir('aidd-freshness-nogit-');
		try {
			const result = await runWithoutGit(
				[
					`const { currentGitHead, isGitWorktree } = await import(${importPath(gitModule)});`,
					`const dir = ${importPath(dir)};`,
					'console.log(JSON.stringify([await isGitWorktree(dir, {}), await currentGitHead(dir, {})]));',
				].join('\n'),
			);
			expect(result.stderr).toBe('');
			expect(result.code).toBe(0);
			expect(result.stdout).toBe('[false,null]');
		} finally {
			await removeTempTree(dir);
		}
	});
});
