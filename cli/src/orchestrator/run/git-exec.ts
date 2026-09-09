// Low-level git process primitives shared by the git helper modules in this directory.
// Kept separate so git.ts (commit/worktree queries) can reach the exec helpers without a
// circular dependency.

// A missing git (clean machine, no install) maps to the same "no repo" signal these return on a
// non-zero exit — never a throw, so run-time git tracking degrades instead of crashing the run.
export async function gitOutput(projectDir: string, args: string[]): Promise<string | undefined> {
	try {
		const proc = Bun.spawn(['git', '-C', projectDir, ...args], {
			stderr: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		});
		if ((await proc.exited) !== 0) return undefined;
		return await new Response(proc.stdout).text();
	} catch {
		return undefined;
	}
}

export async function gitSuccess(projectDir: string, args: string[]): Promise<boolean> {
	try {
		const proc = Bun.spawn(['git', '-C', projectDir, ...args], {
			stderr: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		});
		return (await proc.exited) === 0;
	} catch {
		return false;
	}
}

export async function readGitHead(projectDir: string): Promise<string | undefined> {
	if (!(await projectOwnsGitRepo(projectDir))) return undefined;
	const output = await gitOutput(projectDir, ['rev-parse', '--verify', 'HEAD']);
	return output?.trim() || undefined;
}

async function projectOwnsGitRepo(projectDir: string): Promise<boolean> {
	// `--show-prefix` is projectDir's path relative to the repository root, and is empty exactly
	// when projectDir IS that root. Ask for it rather than comparing `--show-toplevel` against
	// projectDir: git answers with the resolved real path, so under an aliased path — a Windows
	// `subst` drive, a symlink, a junction — the two spellings never match, a repository the
	// project owns reads as a parent's, and every commit the run made goes unattributed.
	const output = await gitOutput(projectDir, ['rev-parse', '--show-prefix']);
	return output !== undefined && output.trim() === '';
}
