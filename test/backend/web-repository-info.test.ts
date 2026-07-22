import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WebContext } from '../../backend/src/context.ts';

import { createProjectsRoutes } from '../../backend/src/routes/projects.ts';
import { readRepositoryInfo } from '../../backend/src/services/git/repoStats.ts';
import { readRepositoryRefs } from '../../backend/src/services/git/repoRefs.ts';
import {
	readProjectGitStatus,
	readProjectGitStatusMap,
} from '../../backend/src/services/git/status.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

import { testTempDir } from '../_helpers/temp.ts';
async function git(cwd: string, ...args: string[]): Promise<string> {
	const subprocess = Bun.spawn(['git', ...args], {
		cwd,
		stderr: 'pipe',
		stdin: 'ignore',
		stdout: 'pipe',
		windowsHide: true,
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(subprocess.stdout).text(),
		new Response(subprocess.stderr).text(),
		subprocess.exited,
	]);
	if (exitCode !== 0) throw new Error(`git ${args.join(' ')} failed: ${stderr}`);
	return stdout.trim();
}

async function makeRepo(): Promise<string> {
	const repoDir = await testTempDir('aidd-repo-info-');
	await git(repoDir, 'init');
	await git(repoDir, 'config', 'user.email', 'test@example.com');
	await git(repoDir, 'config', 'user.name', 'aidd Test');
	await mkdir(join(repoDir, 'src'), { recursive: true });
	await writeFile(join(repoDir, 'src', 'index.ts'), 'export const a = 1;\nexport const b = 2;\n');
	await writeFile(join(repoDir, 'src', 'util.ts'), 'export const c = 3;\n');
	await writeFile(join(repoDir, 'app.py'), 'print("hi")\n');
	await writeFile(join(repoDir, '.gitignore'), 'ignored.ts\n');
	await writeFile(join(repoDir, 'ignored.ts'), 'export const ignored = true;\n');
	await git(repoDir, 'add', 'src', 'app.py', '.gitignore');
	await git(repoDir, 'commit', '-m', 'feat: seed repository');
	await git(repoDir, 'tag', 'v0.1.0');
	return repoDir;
}

describe('readRepositoryInfo', () => {
	test('summarizes a real repository from git-tracked files only', async () => {
		const repoDir = await makeRepo();
		try {
			const result = await readRepositoryInfo(repoDir);
			expect(result.state).toBe('ok');
			const info = result.info;
			expect(info).not.toBeNull();
			if (!info) return;
			expect(info.dominantLanguage).toBe('TypeScript');
			expect(info.tags).toBe(1);
			expect(info.localBranches).toBeGreaterThanOrEqual(1);
			expect(info.latestCommit?.subject).toBe('feat: seed repository');
			expect(info.authors[0]?.name).toBe('aidd Test');
			expect(info.authors[0]?.commits).toBe(1);
			const ts = info.languages.find((lang) => lang.language === 'TypeScript');
			expect(ts?.files).toBe(2);
			expect(ts?.lines).toBe(3);
			// The .gitignore'd file must not be counted anywhere.
			expect(info.totalFiles).toBe(4);
			expect(info.languages.some((lang) => lang.language === 'Python')).toBe(true);
			expect(info.sizeBytes).toBeGreaterThan(0);
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('classifies a non-repo directory as not-a-repo', async () => {
		const plainDir = await testTempDir('aidd-repo-info-plain-');
		try {
			const result = await readRepositoryInfo(plainDir);
			expect(result.state).toBe('not-a-repo');
			expect(result.info).toBeNull();
		} finally {
			await removeTempTree(plainDir);
		}
	});

	test('reports project-missing when the directory does not exist', async () => {
		const result = await readRepositoryInfo(join(tmpdir(), 'aidd-repo-info-does-not-exist'));
		expect(result.state).toBe('project-missing');
	});
});

describe('readProjectGitStatus', () => {
	test('summarizes clean and dirty working tree states', async () => {
		const repoDir = await makeRepo();
		try {
			const clean = await readProjectGitStatus(repoDir);
			expect(clean.state).toBe('clean');
			expect(clean.total).toBe(0);
			expect(typeof clean.branch).toBe('string');

			await writeFile(join(repoDir, 'app.py'), 'print("changed")\n');
			await git(repoDir, 'add', 'app.py');
			await writeFile(join(repoDir, 'src', 'util.ts'), 'export const changed = true;\n');
			await writeFile(join(repoDir, 'new-file.txt'), 'new\n');

			const dirty = await readProjectGitStatus(repoDir);
			expect(dirty.state).toBe('dirty');
			expect(dirty.staged).toBe(1);
			expect(dirty.unstaged).toBe(1);
			expect(dirty.untracked).toBe(1);
			expect(dirty.total).toBe(3);
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('classifies non-repo and missing directories', async () => {
		const plainDir = await testTempDir('aidd-git-status-plain-');
		try {
			const nonRepo = await readProjectGitStatus(plainDir);
			expect(nonRepo.state).toBe('not-a-repo');
		} finally {
			await removeTempTree(plainDir);
		}

		const missing = await readProjectGitStatus(join(tmpdir(), 'aidd-git-status-missing'));
		expect(missing.state).toBe('project-missing');
	});

	test('omits the branch label for detached HEAD', async () => {
		const repoDir = await makeRepo();
		try {
			await git(repoDir, 'checkout', '--detach', 'HEAD');
			const status = await readProjectGitStatus(repoDir);
			expect(status.state).toBe('clean');
			expect(status.branch).toBeNull();
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('reads a bounded status map keyed by project id', async () => {
		const repoDir = await makeRepo();
		try {
			const map = await readProjectGitStatusMap([{ id: 'project-one', path: repoDir }]);
			expect(map['project-one']?.status.state).toBe('clean');
			expect(map['project-one']?.path).toBe(repoDir);
		} finally {
			await removeTempTree(repoDir);
		}
	});
});

describe('project repository-info route', () => {
	test('serves repository statistics for a valid project', async () => {
		const repoDir = await makeRepo();
		try {
			const app = createProjectsRoutes({
				projectService: {
					resolveDiscoveredProject: async () => repoDir,
				},
			} as unknown as WebContext);
			const response = await app.handle(
				new Request('http://localhost/api/v1/projects/some-id/repository-info')
			);
			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				info: { dominantLanguage: string } | null;
				state: string;
			};
			expect(body.state).toBe('ok');
			expect(body.info?.dominantLanguage).toBe('TypeScript');
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('serves git status for one project and for the project list', async () => {
		const repoDir = await makeRepo();
		try {
			const app = createProjectsRoutes({
				projectService: {
					listProjectNames: async () => ({
						projects: [{ id: 'some-id', name: 'repo', path: repoDir }],
						skippedRoots: [],
					}),
					resolveDiscoveredProject: async () => repoDir,
				},
			} as unknown as WebContext);

			const single = await app.handle(
				new Request('http://localhost/api/v1/projects/some-id/git-status')
			);
			expect(single.status).toBe(200);
			const singleBody = (await single.json()) as { status: { state: string } };
			expect(singleBody.status.state).toBe('clean');

			const bulk = await app.handle(
				new Request('http://localhost/api/v1/projects/git-status')
			);
			expect(bulk.status).toBe(200);
			const bulkBody = (await bulk.json()) as {
				projects: Record<string, { status: { state: string } }>;
			};
			expect(bulkBody.projects['some-id']?.status.state).toBe('clean');
		} finally {
			await removeTempTree(repoDir);
		}
	});
});

describe('readRepositoryRefs', () => {
	test('lists branches, stashes, and worktrees from a real repository', async () => {
		const repoDir = await makeRepo();
		try {
			await git(repoDir, 'checkout', '-b', 'feature/test');
			await writeFile(join(repoDir, 'extra.txt'), 'stash me\n');
			await git(repoDir, 'add', 'extra.txt');
			await git(repoDir, 'stash');

			const result = await readRepositoryRefs(repoDir);
			expect(result.state).toBe('ok');
			expect(result.refs).not.toBeNull();
			if (!result.refs) return;

			const branchNames = result.refs.branches.map((b) => b.name);
			expect(branchNames).toContain('feature/test');
			const current = result.refs.branches.find((b) => b.current);
			expect(current?.name).toBe('feature/test');

			expect(result.refs.stashes.length).toBeGreaterThanOrEqual(1);
			expect(result.refs.stashes[0]?.index).toBe(0);
			expect(result.refs.stashes[0]?.subject).toContain('WIP on feature/test');

			expect(result.refs.worktrees.length).toBeGreaterThanOrEqual(1);
			expect(result.refs.worktrees[0]?.main).toBe(true);
			// git reports POSIX separators on every platform. Compare in that form rather than
			// rewriting slashes into backslashes, which only ever matched on Windows and turned a
			// perfectly good Linux path into `\tmp\...` in CI.
			expect(result.refs.worktrees[0]?.path.replaceAll('\\', '/')).toBe(
				repoDir.replaceAll('\\', '/')
			);
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('returns empty stashes when none exist', async () => {
		const repoDir = await makeRepo();
		try {
			const result = await readRepositoryRefs(repoDir);
			expect(result.state).toBe('ok');
			if (!result.refs) return;
			expect(result.refs.stashes).toEqual([]);
			expect(result.refs.branches.length).toBeGreaterThanOrEqual(1);
			expect(result.refs.worktrees.length).toBeGreaterThanOrEqual(1);
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('classifies a non-repo directory as not-a-repo', async () => {
		const plainDir = await testTempDir('aidd-repo-refs-plain-');
		try {
			const result = await readRepositoryRefs(plainDir);
			expect(result.state).toBe('not-a-repo');
			expect(result.refs).toBeNull();
		} finally {
			await removeTempTree(plainDir);
		}
	});

	test('reports project-missing when the directory does not exist', async () => {
		const result = await readRepositoryRefs(join(tmpdir(), 'aidd-repo-refs-does-not-exist'));
		expect(result.state).toBe('project-missing');
	});
});

describe('project repository-refs route', () => {
	test('serves branch, stash, and worktree refs for a valid project', async () => {
		const repoDir = await makeRepo();
		try {
			const app = createProjectsRoutes({
				projectService: {
					resolveDiscoveredProject: async () => repoDir,
				},
			} as unknown as WebContext);
			const response = await app.handle(
				new Request('http://localhost/api/v1/projects/some-id/repository-refs')
			);
			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				refs: {
					branches: { name: string; current: boolean }[];
					stashes: unknown[];
					worktrees: unknown[];
				} | null;
				state: string;
			};
			expect(body.state).toBe('ok');
			expect(body.refs).not.toBeNull();
			expect(body.refs!.branches.length).toBeGreaterThanOrEqual(1);
			expect(body.refs!.stashes).toEqual([]);
			expect(body.refs!.worktrees.length).toBeGreaterThanOrEqual(1);
		} finally {
			await removeTempTree(repoDir);
		}
	});
});
