import { describe, expect, test } from 'bun:test';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	parseWorkingTreeStatus,
	readWorkingTree,
} from '../../backend/src/services/git/workingTree.ts';
import {
	resetWorkingTreeIndex,
	stageWorkingTreePaths,
	unstageWorkingTreePaths,
} from '../../backend/src/services/git/workingTreeActions.ts';
import { git, makeWorkingTreeRepo } from './_helpers/working-tree-repo.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

const NUL = '\0';

describe('parseWorkingTreeStatus', () => {
	test('classifies staged, unstaged, untracked, and conflicted entries', () => {
		const stdout = [
			'M  staged.txt',
			' M dirty.txt',
			'MM both.txt',
			'?? new.txt',
			'UU merge.txt',
		]
			.map((line) => `${line}${NUL}`)
			.join('');
		const { files, truncated } = parseWorkingTreeStatus(stdout);
		expect(truncated).toBe(false);
		expect(files.map((file) => file.path)).toEqual([
			'staged.txt',
			'dirty.txt',
			'both.txt',
			'new.txt',
			'merge.txt',
		]);
		expect(files[0]).toMatchObject({ staged: true, unstaged: false, untracked: false });
		expect(files[1]).toMatchObject({ staged: false, unstaged: true, untracked: false });
		expect(files[2]).toMatchObject({ staged: true, unstaged: true });
		expect(files[3]).toMatchObject({ conflicted: false, staged: false, untracked: true });
		expect(files[4]).toMatchObject({ conflicted: true, untracked: false });
	});

	test('reads the pre-rename path from the record that follows a rename', () => {
		const stdout = `R  after.txt${NUL}before.txt${NUL}?? other.txt${NUL}`;
		const { files } = parseWorkingTreeStatus(stdout);
		expect(files).toHaveLength(2);
		expect(files[0]).toMatchObject({ origPath: 'before.txt', path: 'after.txt', staged: true });
		// The pre-rename record must be consumed, not read back as an entry of its own.
		expect(files[1]?.path).toBe('other.txt');
	});

	test('keeps paths containing spaces intact', () => {
		const { files } = parseWorkingTreeStatus(`?? a file with spaces.txt${NUL}`);
		expect(files[0]?.path).toBe('a file with spaces.txt');
	});
});

describe('readWorkingTree', () => {
	test('lists every changed path in a real repository', async () => {
		const repoDir = await makeWorkingTreeRepo();
		try {
			await writeFile(join(repoDir, 'edited.txt'), 'changed\n');
			await writeFile(join(repoDir, 'fresh.txt'), 'brand new\n');
			await rm(join(repoDir, 'doomed.txt'));

			const result = await readWorkingTree(repoDir);
			expect(result.state).toBe('ok');
			const byPath = new Map(result.files.map((file) => [file.path, file]));
			expect(byPath.get('edited.txt')).toMatchObject({ staged: false, unstaged: true });
			expect(byPath.get('fresh.txt')).toMatchObject({ untracked: true });
			expect(byPath.get('doomed.txt')).toMatchObject({ unstaged: true, worktreeStatus: 'D' });
			expect(byPath.has('kept.txt')).toBe(false);
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('reports not-a-repo for a directory outside git', async () => {
		const repoDir = await makeWorkingTreeRepo();
		try {
			await removeTempTree(join(repoDir, '.git'));
			const result = await readWorkingTree(repoDir);
			expect(result.state).toBe('not-a-repo');
			expect(result.files).toEqual([]);
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('reports project-missing when the directory is gone', async () => {
		const result = await readWorkingTree(join(process.cwd(), 'does-not-exist-anywhere'));
		expect(result.state).toBe('project-missing');
	});
});

describe('stage, unstage, and reset', () => {
	test('stages the selected files and leaves the others alone', async () => {
		const repoDir = await makeWorkingTreeRepo();
		try {
			await writeFile(join(repoDir, 'edited.txt'), 'changed\n');
			await writeFile(join(repoDir, 'fresh.txt'), 'brand new\n');

			const result = await stageWorkingTreePaths(repoDir, ['edited.txt']);
			expect(result.ok).toBe(true);
			const byPath = new Map(result.after.files.map((file) => [file.path, file]));
			expect(byPath.get('edited.txt')).toMatchObject({ staged: true, unstaged: false });
			expect(byPath.get('fresh.txt')).toMatchObject({ staged: false, untracked: true });
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('stages an untracked file and a deletion', async () => {
		const repoDir = await makeWorkingTreeRepo();
		try {
			await writeFile(join(repoDir, 'fresh.txt'), 'brand new\n');
			await rm(join(repoDir, 'doomed.txt'));

			const result = await stageWorkingTreePaths(repoDir, ['fresh.txt', 'doomed.txt']);
			expect(result.ok).toBe(true);
			const byPath = new Map(result.after.files.map((file) => [file.path, file]));
			expect(byPath.get('fresh.txt')).toMatchObject({ indexStatus: 'A', staged: true });
			expect(byPath.get('doomed.txt')).toMatchObject({ indexStatus: 'D', staged: true });
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('unstages the selected files without touching the working tree', async () => {
		const repoDir = await makeWorkingTreeRepo();
		try {
			await writeFile(join(repoDir, 'edited.txt'), 'changed\n');
			await git(repoDir, 'add', 'edited.txt');

			const result = await unstageWorkingTreePaths(repoDir, ['edited.txt']);
			expect(result.ok).toBe(true);
			expect(result.after.files[0]).toMatchObject({
				path: 'edited.txt',
				staged: false,
				unstaged: true,
			});
			expect(await Bun.file(join(repoDir, 'edited.txt')).text()).toBe('changed\n');
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('reset unstages everything and keeps every edit on disk', async () => {
		const repoDir = await makeWorkingTreeRepo();
		try {
			await writeFile(join(repoDir, 'edited.txt'), 'changed\n');
			await writeFile(join(repoDir, 'fresh.txt'), 'brand new\n');
			await git(repoDir, 'add', '.');

			const result = await resetWorkingTreeIndex(repoDir);
			expect(result.ok).toBe(true);
			expect(result.after.files.every((file) => !file.staged)).toBe(true);
			expect(result.after.files.map((file) => file.path).sort()).toEqual([
				'edited.txt',
				'fresh.txt',
			]);
			expect(await Bun.file(join(repoDir, 'edited.txt')).text()).toBe('changed\n');
			expect(await Bun.file(join(repoDir, 'fresh.txt')).text()).toBe('brand new\n');
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('reset works on an unborn HEAD', async () => {
		const repoDir = await makeWorkingTreeRepo();
		try {
			await removeTempTree(join(repoDir, '.git'));
			await git(repoDir, 'init');
			await git(repoDir, 'add', 'kept.txt');

			const result = await resetWorkingTreeIndex(repoDir);
			expect(result.ok).toBe(true);
			expect(result.after.files.find((file) => file.path === 'kept.txt')?.untracked).toBe(
				true,
			);
		} finally {
			await removeTempTree(repoDir);
		}
	});
});
