// A project's own commit, as both the web launcher and the CLI must judge it. They have to agree:
// the launcher queues a run with --worktree only when the CLI can honor it, and admission counts
// a run as isolated from that flag.

// A missing git (clean machine, no install) reads as "no repo", never a throw.
async function gitStdout(projectDir: string, args: string[]): Promise<string | undefined> {
	try {
		const proc = Bun.spawn(['git', '-C', projectDir, ...args], {
			stderr: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		});
		const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
		return code === 0 ? stdout : undefined;
	} catch {
		return undefined;
	}
}

async function projectOwnsGitRepo(projectDir: string): Promise<boolean> {
	// `--show-prefix` is projectDir's path relative to the repository root, and is empty exactly
	// when projectDir IS that root. Ask for it rather than comparing `--show-toplevel` against
	// projectDir: git answers with the resolved real path, so under an aliased path — a Windows
	// `subst` drive, a symlink, a junction — the two spellings never match, a repository the
	// project owns reads as a parent's, and every commit the run made goes unattributed.
	const output = await gitStdout(projectDir, ['rev-parse', '--show-prefix']);
	return output !== undefined && output.trim() === '';
}

/**
 * HEAD of the repository projectDir is the root of. A project that sits inside a parent's
 * repository has no HEAD of its own: the parent's commits are not the project's, and a worktree
 * cut from them would not contain the project where the run expects it.
 */
export async function readGitHead(projectDir: string): Promise<string | undefined> {
	if (!(await projectOwnsGitRepo(projectDir))) return undefined;
	const output = await gitStdout(projectDir, ['rev-parse', '--verify', 'HEAD']);
	return output?.trim() || undefined;
}
