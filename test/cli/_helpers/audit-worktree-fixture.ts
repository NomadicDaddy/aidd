import type { RunPlan } from 'aidd-shared/plan/types';

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { testTempDir } from '../../_helpers/temp.ts';
import { removeTempTree } from '../../backend/_helpers/remove-temp-tree.ts';

export function auditGit(cwd: string, ...args: string[]): string {
	const result = Bun.spawnSync(['git', '-C', cwd, ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

async function createFixture(
	roots: string[],
	committed: boolean,
): Promise<{ plan: RunPlan; root: string }> {
	const root = await testTempDir('aidd-audit-worktree-');
	roots.push(root);
	auditGit(root, 'init');
	auditGit(root, 'config', 'user.email', 'test@example.com');
	auditGit(root, 'config', 'user.name', 'aidd test');
	await mkdir(join(root, '.aidd'), { recursive: true });
	await writeFile(join(root, '.aidd', 'spec.md'), '# Synthetic fixture\n');
	await writeFile(join(root, '.gitignore'), '.aidd/\ndata/\n');
	await writeFile(join(root, 'source.txt'), 'original\n');
	if (committed) {
		auditGit(root, 'add', '.gitignore', 'source.txt');
		auditGit(root, 'commit', '-m', 'fixture');
	}
	return { plan: { mode: 'audit', projectDir: root } as RunPlan, root };
}

export function createAuditWorktreeFixtures() {
	const roots: string[] = [];
	return {
		cleanup: async (): Promise<void> => {
			await Promise.all(roots.splice(0).map((root) => removeTempTree(root)));
		},
		fixture: (committed = true) => createFixture(roots, committed),
	};
}
