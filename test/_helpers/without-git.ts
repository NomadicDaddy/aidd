/**
 * Runs `script` in a fresh Bun process whose PATH holds nothing, so `git` cannot be found. A
 * running Bun resolves executables from the PATH it started with, so clearing process.env.PATH in
 * the test process changes nothing; only a new process models a machine without git. Windows
 * needs SystemRoot to start a process at all, so that is carried over.
 * @returns The child's exit code and trimmed stdout and stderr.
 */
export async function runWithoutGit(
	script: string,
): Promise<{ code: number; stderr: string; stdout: string }> {
	const env: Record<string, string> = { PATH: '' };
	if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
	const proc = Bun.spawn([process.execPath, '-e', script], {
		env,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	return { code: await proc.exited, stderr: stderr.trim(), stdout: stdout.trim() };
}

/** A module path for an `import()` inside a child script, as a quoted literal. */
export function importPath(absolutePath: string): string {
	return JSON.stringify(absolutePath.replace(/\\/g, '/'));
}
