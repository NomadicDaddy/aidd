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

/** gitSuccess that keeps stderr, so a refusal can be reported. Same no-throw contract. */
export async function gitRun(
	projectDir: string,
	args: string[],
): Promise<{ ok: boolean; stderr: string }> {
	try {
		const proc = Bun.spawn(['git', '-C', projectDir, ...args], {
			stderr: 'pipe',
			stdout: 'ignore',
			windowsHide: true,
		});
		const stderr = await new Response(proc.stderr).text();
		return { ok: (await proc.exited) === 0, stderr: stderr.trim() };
	} catch (err) {
		return { ok: false, stderr: err instanceof Error ? err.message : String(err) };
	}
}

// The own-root HEAD check is shared with the web launcher, which must agree with it.
export { readGitHead } from 'aidd-shared/lib/gitHead';
