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
	const output = await gitOutput(projectDir, ['rev-parse', '--show-toplevel']);
	if (!output) return false;
	const toplevel = output.trim();
	if (!toplevel) return false;
	const normalize = (value: string): string =>
		value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
	return normalize(toplevel) === normalize(projectDir);
}
