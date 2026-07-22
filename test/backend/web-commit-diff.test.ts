import { describe, expect, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WebContext } from '../../backend/src/context.ts';

import { createProjectsRoutes } from '../../backend/src/routes/projects.ts';
import { readCommitDiff } from '../../backend/src/services/git/commitDiff.ts';
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

async function makeRepoWithCommit(): Promise<{ repoDir: string; sha: string }> {
	const repoDir = await testTempDir('aidd-commit-diff-');
	await git(repoDir, 'init');
	await git(repoDir, 'config', 'user.email', 'test@example.com');
	await git(repoDir, 'config', 'user.name', 'aidd Test');
	await writeFile(join(repoDir, 'alpha.txt'), 'first line\n');
	await git(repoDir, 'add', '.');
	await git(repoDir, 'commit', '-m', 'feat: add alpha');
	await writeFile(join(repoDir, 'alpha.txt'), 'first line\nsecond line\n');
	await git(repoDir, 'add', '.');
	await git(repoDir, 'commit', '-m', 'feat: extend alpha');
	const sha = await git(repoDir, 'rev-parse', 'HEAD');
	return { repoDir, sha };
}

describe('readCommitDiff', () => {
	test('returns the stat block and patch for a recorded commit', async () => {
		const { repoDir, sha } = await makeRepoWithCommit();
		try {
			const result = await readCommitDiff(repoDir, sha);
			expect(result.state).toBe('ok');
			expect(result.truncated).toBe(false);
			expect(result.diff).toContain('feat: extend alpha');
			expect(result.diff).toContain('diff --git a/alpha.txt b/alpha.txt');
			expect(result.diff).toContain('+second line');
			expect(result.diff).toContain('1 file changed');
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('classifies an unknown-but-valid sha as missing-commit', async () => {
		const { repoDir } = await makeRepoWithCommit();
		try {
			const result = await readCommitDiff(repoDir, 'f'.repeat(40));
			expect(result.state).toBe('missing-commit');
			expect(result.diff).toBe('');
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('classifies a non-repo directory as not-a-repo', async () => {
		const plainDir = await testTempDir('aidd-commit-diff-plain-');
		try {
			const result = await readCommitDiff(plainDir, 'a'.repeat(40));
			expect(result.state).toBe('not-a-repo');
		} finally {
			await removeTempTree(plainDir);
		}
	});

	test('reports project-missing when the directory does not exist', async () => {
		const result = await readCommitDiff(
			join(tmpdir(), 'aidd-commit-diff-does-not-exist'),
			'a'.repeat(40)
		);
		expect(result.state).toBe('project-missing');
	});

	test('rejects a malformed hash without spawning git', async () => {
		const result = await readCommitDiff(tmpdir(), 'abc; rm -rf /');
		expect(result.state).toBe('error');
		expect(result.reason).toContain('hex');
	});
});

describe('project commit diff route', () => {
	test('rejects a malformed sha at the schema layer', async () => {
		const app = createProjectsRoutes({
			projectService: {
				resolveDiscoveredProject: async () => tmpdir(),
			},
		} as unknown as WebContext);
		const response = await app.handle(
			new Request('http://localhost/api/v1/projects/some-id/commits/not-hex!')
		);
		expect(response.status).toBe(422);
	});

	test('serves a diff for a valid sha', async () => {
		const { repoDir, sha } = await makeRepoWithCommit();
		try {
			const app = createProjectsRoutes({
				projectService: {
					resolveDiscoveredProject: async () => repoDir,
				},
			} as unknown as WebContext);
			const response = await app.handle(
				new Request(`http://localhost/api/v1/projects/some-id/commits/${sha}`)
			);
			expect(response.status).toBe(200);
			const body = (await response.json()) as { diff: string; state: string };
			expect(body.state).toBe('ok');
			expect(body.diff).toContain('diff --git');
		} finally {
			await removeTempTree(repoDir);
		}
	});
});
