import { describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { WebContext } from '../../backend/src/context.ts';

import { errorHandlerPlugin } from '../../backend/src/plugins/errorHandler.ts';
import { createProjectWorkingTreeRoutes } from '../../backend/src/routes/projectWorkingTree.ts';
import { readWorkingTree } from '../../backend/src/services/git/workingTree.ts';
import { discardWorkingTreePaths } from '../../backend/src/services/git/workingTreeActions.ts';
import {
	commitStagedWorkingTree,
	commitWorkingTreePaths,
} from '../../backend/src/services/git/workingTreeCommit.ts';
import { git, makeWorkingTreeRepo } from './_helpers/working-tree-repo.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

function appFor(repoDir: string) {
	return new Elysia().use(errorHandlerPlugin).use(
		createProjectWorkingTreeRoutes({
			projectService: { resolveDiscoveredProject: async () => repoDir },
		} as unknown as WebContext),
	);
}

function post(app: ReturnType<typeof appFor>, action: string, body: unknown): Promise<Response> {
	return app.handle(
		new Request(`http://localhost/api/v1/projects/some-id/working-tree/${action}`, {
			body: JSON.stringify(body),
			headers: { 'content-type': 'application/json' },
			method: 'POST',
		}),
	);
}

describe('discardWorkingTreePaths', () => {
	test('reverts a tracked edit and deletes an untracked file', async () => {
		const repoDir = await makeWorkingTreeRepo();
		try {
			await writeFile(join(repoDir, 'edited.txt'), 'changed\n');
			await writeFile(join(repoDir, 'fresh.txt'), 'brand new\n');

			const result = await discardWorkingTreePaths(repoDir, ['edited.txt', 'fresh.txt']);
			expect(result.ok).toBe(true);
			expect(result.after.files).toEqual([]);
			expect(await Bun.file(join(repoDir, 'edited.txt')).text()).toBe('original\n');
			expect(await Bun.file(join(repoDir, 'fresh.txt')).exists()).toBe(false);
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('restores a deleted file and undoes a staged add', async () => {
		const repoDir = await makeWorkingTreeRepo();
		try {
			await rm(join(repoDir, 'doomed.txt'));
			await writeFile(join(repoDir, 'added.txt'), 'staged add\n');
			await git(repoDir, 'add', 'added.txt');

			const result = await discardWorkingTreePaths(repoDir, ['doomed.txt', 'added.txt']);
			expect(result.ok).toBe(true);
			expect(result.after.files).toEqual([]);
			expect(await Bun.file(join(repoDir, 'doomed.txt')).text()).toBe('doomed\n');
			expect(await Bun.file(join(repoDir, 'added.txt')).exists()).toBe(false);
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('undoes both halves of a staged rename', async () => {
		const repoDir = await makeWorkingTreeRepo();
		try {
			await git(repoDir, 'mv', 'edited.txt', 'renamed.txt');
			const before = await readWorkingTree(repoDir);
			expect(before.files[0]).toMatchObject({
				origPath: 'edited.txt',
				path: 'renamed.txt',
			});

			const result = await discardWorkingTreePaths(repoDir, ['renamed.txt']);
			expect(result.ok).toBe(true);
			// The pre-rename path must come back too — discarding only the new half would leave
			// `edited.txt` staged as a deletion.
			expect(result.after.files).toEqual([]);
			expect(await Bun.file(join(repoDir, 'edited.txt')).text()).toBe('original\n');
			expect(await Bun.file(join(repoDir, 'renamed.txt')).exists()).toBe(false);
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('treats a filename that looks like a pathspec pattern as a literal name', async () => {
		const repoDir = await makeWorkingTreeRepo();
		try {
			// `[ab].txt` is a valid glob for `a.txt`, so every read and every removal in the discard
			// flow has to be literal — otherwise picking one file deletes its unselected neighbours.
			await writeFile(join(repoDir, 'a.txt'), 'neighbour\n');
			await git(repoDir, 'add', 'a.txt');
			await git(repoDir, 'commit', '-m', 'feat: neighbour');
			await writeFile(join(repoDir, 'a.txt'), 'neighbour edited\n');
			await writeFile(join(repoDir, '[ab].txt'), 'literal\n');

			const scoped = await readWorkingTree(repoDir, ['[ab].txt']);
			expect(scoped.files.map((file) => file.path)).toEqual(['[ab].txt']);

			const result = await discardWorkingTreePaths(repoDir, ['[ab].txt']);
			expect(result.ok).toBe(true);
			expect(await Bun.file(join(repoDir, '[ab].txt')).exists()).toBe(false);
			expect(await Bun.file(join(repoDir, 'a.txt')).text()).toBe('neighbour edited\n');
			expect(result.after.files.map((file) => file.path)).toEqual(['a.txt']);
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('leaves unselected files untouched', async () => {
		const repoDir = await makeWorkingTreeRepo();
		try {
			await writeFile(join(repoDir, 'edited.txt'), 'changed\n');
			await writeFile(join(repoDir, 'kept.txt'), 'also changed\n');

			const result = await discardWorkingTreePaths(repoDir, ['edited.txt']);
			expect(result.ok).toBe(true);
			expect(result.after.files.map((file) => file.path)).toEqual(['kept.txt']);
			expect(await Bun.file(join(repoDir, 'kept.txt')).text()).toBe('also changed\n');
		} finally {
			await removeTempTree(repoDir);
		}
	});
});

describe('commit', () => {
	test('commits exactly the selected paths and leaves the rest dirty', async () => {
		const repoDir = await makeWorkingTreeRepo();
		try {
			await writeFile(join(repoDir, 'edited.txt'), 'changed\n');
			await writeFile(join(repoDir, 'kept.txt'), 'also changed\n');

			const result = await commitWorkingTreePaths(repoDir, ['edited.txt'], 'fix: edit only');
			expect(result.reason).toBeNull();
			expect(result.ok).toBe(true);
			expect(result.after.files.map((file) => file.path)).toEqual(['kept.txt']);
			expect(await git(repoDir, 'log', '-1', '--format=%s')).toBe('fix: edit only');
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('commits the staged files and keeps unstaged edits in the working tree', async () => {
		const repoDir = await makeWorkingTreeRepo();
		try {
			await writeFile(join(repoDir, 'edited.txt'), 'changed\n');
			await git(repoDir, 'add', 'edited.txt');
			await writeFile(join(repoDir, 'kept.txt'), 'still dirty\n');

			const result = await commitStagedWorkingTree(repoDir, 'fix: staged only');
			expect(result.ok).toBe(true);
			expect(result.after.files.map((file) => file.path)).toEqual(['kept.txt']);
			expect(result.after.files[0]?.staged).toBe(false);
			expect(await git(repoDir, 'log', '-1', '--format=%s')).toBe('fix: staged only');
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('rejects committing staged files when nothing is staged', async () => {
		const repoDir = await makeWorkingTreeRepo();
		try {
			await writeFile(join(repoDir, 'edited.txt'), 'changed\n');
			await expect(commitStagedWorkingTree(repoDir, 'fix: nothing')).rejects.toThrow(
				/Nothing is staged/,
			);
		} finally {
			await removeTempTree(repoDir);
		}
	});
});

describe('working-tree routes', () => {
	test('GET lists the changed files', async () => {
		const repoDir = await makeWorkingTreeRepo();
		try {
			await writeFile(join(repoDir, 'edited.txt'), 'changed\n');
			const response = await appFor(repoDir).handle(
				new Request('http://localhost/api/v1/projects/some-id/working-tree'),
			);
			expect(response.status).toBe(200);
			const body = (await response.json()) as { files: { path: string }[]; state: string };
			expect(body.state).toBe('ok');
			expect(body.files.map((file) => file.path)).toEqual(['edited.txt']);
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('rejects a path git does not currently report as changed', async () => {
		const repoDir = await makeWorkingTreeRepo();
		try {
			await writeFile(join(repoDir, 'edited.txt'), 'changed\n');
			const response = await post(appFor(repoDir), 'discard', {
				paths: ['../../etc/hosts'],
			});
			expect(response.status).toBe(409);
			// The traversal attempt must not have touched the one file that really is dirty.
			expect(await Bun.file(join(repoDir, 'edited.txt')).text()).toBe('changed\n');
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('rejects a clean tracked file, so discard cannot delete arbitrary repository files', async () => {
		const repoDir = await makeWorkingTreeRepo();
		try {
			await writeFile(join(repoDir, 'edited.txt'), 'changed\n');
			const response = await post(appFor(repoDir), 'discard', { paths: ['kept.txt'] });
			expect(response.status).toBe(409);
			expect(await Bun.file(join(repoDir, 'kept.txt')).exists()).toBe(true);
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('rejects an empty selection and an empty commit message', async () => {
		const repoDir = await makeWorkingTreeRepo();
		try {
			await writeFile(join(repoDir, 'edited.txt'), 'changed\n');
			const app = appFor(repoDir);
			expect((await post(app, 'stage', { paths: [] })).status).toBe(400);
			expect((await post(app, 'commit', { message: '', paths: ['edited.txt'] })).status).toBe(
				400,
			);
			expect((await post(app, 'commit-staged', { message: '   ' })).status).toBe(400);
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('stage, commit, and reset round-trip through the routes', async () => {
		const repoDir = await makeWorkingTreeRepo();
		try {
			await writeFile(join(repoDir, 'edited.txt'), 'changed\n');
			await writeFile(join(repoDir, 'kept.txt'), 'also changed\n');
			const app = appFor(repoDir);

			const staged = await post(app, 'stage', { paths: ['edited.txt', 'kept.txt'] });
			expect(staged.status).toBe(200);

			const unstaged = await post(app, 'reset', {});
			expect(unstaged.status).toBe(200);
			const afterReset = (await unstaged.json()) as {
				after: { files: { staged: boolean }[] };
			};
			expect(afterReset.after.files.every((file) => !file.staged)).toBe(true);

			const committed = await post(app, 'commit', {
				message: 'chore: via route',
				paths: ['edited.txt'],
			});
			expect(committed.status).toBe(200);
			const body = (await committed.json()) as {
				after: { files: { path: string }[] };
				ok: boolean;
			};
			expect(body.ok).toBe(true);
			expect(body.after.files.map((file) => file.path)).toEqual(['kept.txt']);
		} finally {
			await removeTempTree(repoDir);
		}
	});
});
