import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { testTempDir } from '../../_helpers/temp.ts';

export async function git(cwd: string, ...args: string[]): Promise<string> {
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

/** A repository with one commit holding `kept.txt`, `edited.txt`, and `doomed.txt`. */
export async function makeWorkingTreeRepo(): Promise<string> {
	const repoDir = await testTempDir('aidd-working-tree-');
	await git(repoDir, 'init');
	await git(repoDir, 'config', 'user.email', 'test@example.com');
	await git(repoDir, 'config', 'user.name', 'aidd Test');
	// The panel commits through git, which runs whatever hooks the repository has installed; the
	// fixture must not inherit the developer's global hooks path.
	await git(repoDir, 'config', 'core.hooksPath', join(repoDir, '.git', 'no-hooks'));
	// Nor its line-ending policy: with the Windows default `core.autocrlf=true`, a file restored
	// from HEAD comes back CRLF and no longer matches the bytes the fixture wrote.
	await git(repoDir, 'config', 'core.autocrlf', 'false');
	await writeFile(join(repoDir, 'kept.txt'), 'kept\n');
	await writeFile(join(repoDir, 'edited.txt'), 'original\n');
	await writeFile(join(repoDir, 'doomed.txt'), 'doomed\n');
	await git(repoDir, 'add', '.');
	await git(repoDir, 'commit', '-m', 'feat: seed');
	return repoDir;
}
