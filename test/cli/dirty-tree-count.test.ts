import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';

import { gitDirtyFileCount } from '../../cli/src/orchestrator/run/git.ts';
import { removeTempTree } from '../backend/_helpers/remove-temp-tree.ts';

const tmpRoot = join(import.meta.dir, '..', '..', '.tmp-dirty-tree-count-tests');

async function runGit(projectDir: string, args: string[]): Promise<void> {
	const proc = Bun.spawn(['git', '-C', projectDir, ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if ((await proc.exited) !== 0) {
		throw new Error(`git ${args.join(' ')} failed: ${await new Response(proc.stderr).text()}`);
	}
}

async function initRepo(name: string): Promise<string> {
	const projectDir = join(tmpRoot, name);
	await mkdir(projectDir, { recursive: true });
	await runGit(projectDir, ['init']);
	await runGit(projectDir, ['config', 'user.email', 'test@example.invalid']);
	await runGit(projectDir, ['config', 'user.name', 'Test']);
	return projectDir;
}

afterEach(async () => {
	await removeTempTree(tmpRoot);
});

describe('gitDirtyFileCount dirty-tree gate exclusion', () => {
	test('excludeAiddMetadata drops untracked .aidd metadata but keeps it in the raw count', async () => {
		const projectDir = await initRepo('aidd-metadata-only');
		// Simulate intake writing aidd runtime metadata into a repo whose .gitignore does
		// not cover .aidd/ — every one of these stays untracked.
		await mkdir(join(projectDir, '.aidd', '_common'), { recursive: true });
		await mkdir(join(projectDir, '.aidd', 'iterations'), { recursive: true });
		await mkdir(join(projectDir, '.aidd', 'features', 'sample'), { recursive: true });
		await writeFile(join(projectDir, '.aidd', 'runs.jsonl'), '{}\n');
		await writeFile(join(projectDir, '.aidd', '_common', 'hard-constraints.md'), '# rules\n');
		await writeFile(join(projectDir, '.aidd', 'iterations', '001.json'), '{}\n');
		await writeFile(
			join(projectDir, '.aidd', 'features', 'sample', 'feature.json'),
			'{"id":"sample"}\n',
		);

		// The gate ignores aidd-owned metadata entirely.
		expect(await gitDirtyFileCount(projectDir, { excludeAiddMetadata: true })).toBe(0);
		// The residual-dirty count (default) still sees every untracked file.
		expect(await gitDirtyFileCount(projectDir)).toBeGreaterThanOrEqual(4);
	});

	test('the same number of untracked files under app paths still trips the gate', async () => {
		const projectDir = await initRepo('app-file-dirt');
		await mkdir(join(projectDir, 'src'), { recursive: true });
		await writeFile(join(projectDir, 'src', 'a.py'), 'a\n');
		await writeFile(join(projectDir, 'src', 'b.py'), 'b\n');
		await writeFile(join(projectDir, 'src', 'c.py'), 'c\n');
		await writeFile(join(projectDir, 'README.md'), 'readme\n');

		// Application-code dirt is counted even with the aidd exclusion enabled.
		expect(await gitDirtyFileCount(projectDir, { excludeAiddMetadata: true })).toBe(4);
	});

	test('mixed tree counts app-file dirt but not aidd metadata', async () => {
		const projectDir = await initRepo('mixed-dirt');
		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		await writeFile(join(projectDir, '.aidd', 'CHANGELOG.md'), '# log\n');
		await writeFile(join(projectDir, '.aidd', 'spec.md'), '# spec\n');
		await writeFile(join(projectDir, 'app.py'), 'print()\n');

		expect(await gitDirtyFileCount(projectDir, { excludeAiddMetadata: true })).toBe(1);
	});
});
