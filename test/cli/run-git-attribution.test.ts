import { describe, expect, test } from 'bun:test';

import { symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { listGitCommits, readGitHead } from '../../cli/src/orchestrator/run/git.ts';
import { testTempDir } from '../_helpers/temp.ts';

async function git(cwd: string, args: string[], committedAt?: string): Promise<string> {
	const proc = Bun.spawn(['git', '-C', cwd, ...args], {
		env:
			committedAt === undefined
				? process.env
				: {
						...process.env,
						GIT_AUTHOR_DATE: committedAt,
						GIT_COMMITTER_DATE: committedAt,
					},
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	const exitCode = await proc.exited;
	const stdout = await new Response(proc.stdout).text();
	if (exitCode !== 0) throw new Error(await new Response(proc.stderr).text());
	return stdout.trim();
}

describe('run commit attribution', () => {
	test('excludes range commits whose committer timestamp predates the iteration', async () => {
		const projectDir = await testTempDir('aidd-run-git-attribution-');
		await git(projectDir, ['init', '-q']);
		await git(projectDir, ['config', 'user.email', 'aidd-test@example.invalid']);
		await git(projectDir, ['config', 'user.name', 'aidd Test']);

		await writeFile(join(projectDir, 'base.txt'), 'base\n');
		await git(projectDir, ['add', 'base.txt']);
		await git(projectDir, ['commit', '-qm', 'base'], '2026-07-20T11:59:00Z');
		const before = await git(projectDir, ['rev-parse', 'HEAD']);

		await writeFile(join(projectDir, 'old.txt'), 'old\n');
		await git(projectDir, ['add', 'old.txt']);
		await git(projectDir, ['commit', '-qm', 'pre-run'], '2026-07-20T12:00:00Z');

		await writeFile(join(projectDir, 'new.txt'), 'new\n');
		await git(projectDir, ['add', 'new.txt']);
		await git(projectDir, ['commit', '-qm', 'during-run'], '2026-07-20T12:00:10Z');
		const after = await git(projectDir, ['rev-parse', 'HEAD']);

		const commits = await listGitCommits(
			projectDir,
			before,
			after,
			Date.parse('2026-07-20T12:00:05Z'),
		);

		expect(commits).toEqual([{ hash: after, subject: 'during-run' }]);
	});

	// git answers path queries with the RESOLVED real path, so a project reached through an
	// aliased spelling of its own directory — a Windows `subst` drive, a symlink, a junction —
	// used to fail the "does this project own its repository?" test and report no HEAD at all.
	// Every commit the run made then went unattributed, and completions that require a commit
	// were reverted as if the agent had never committed.
	test('reads HEAD through an aliased path to the project directory', async () => {
		const projectDir = await testTempDir('aidd-run-git-alias-');
		await git(projectDir, ['init', '-q']);
		await git(projectDir, ['config', 'user.email', 'aidd-test@example.invalid']);
		await git(projectDir, ['config', 'user.name', 'aidd Test']);
		await writeFile(join(projectDir, 'base.txt'), 'base\n');
		await git(projectDir, ['add', 'base.txt']);
		await git(projectDir, ['commit', '-qm', 'base']);
		const head = await git(projectDir, ['rev-parse', 'HEAD']);

		// `junction` is Windows-only and ignored elsewhere, which is what makes this portable:
		// a directory junction needs no elevation, and POSIX gets a plain symlink.
		const alias = `${projectDir}-alias`;
		await symlink(projectDir, alias, 'junction');

		expect(await readGitHead(alias)).toBe(head);
	});
});
