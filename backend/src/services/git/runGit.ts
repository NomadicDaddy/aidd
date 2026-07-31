// Shared bounded git runner for the repository surfaces.
//
// Bun.spawn (never node:child_process) — on Windows the latter leaks the HTTP listen socket into
// the child and orphans the port. The argv array means no shell interpolation of the project path,
// the file paths, or the commit message.

export interface GitOutput {
	ok: boolean;
	stderr: string;
	stdout: string;
	timedOut: boolean;
}

export async function runGit(cwd: string, args: string[], timeoutMs: number): Promise<GitOutput> {
	let subprocess: ReturnType<typeof Bun.spawn>;
	try {
		subprocess = Bun.spawn(['git', ...args], {
			cwd,
			stderr: 'pipe',
			stdin: 'ignore',
			stdout: 'pipe',
			windowsHide: true,
		});
	} catch (err) {
		// Bun.spawn throws (rather than exiting non-zero) when the git binary is absent.
		const stderr = err instanceof Error ? err.message : String(err);
		return { ok: false, stderr, stdout: '', timedOut: false };
	}
	const readStream = (stream: unknown): Promise<string> =>
		stream instanceof ReadableStream ? new Response(stream).text() : Promise.resolve('');
	const settled = (async () => {
		const [stdout, stderr, exitCode] = await Promise.all([
			readStream(subprocess.stdout),
			readStream(subprocess.stderr),
			subprocess.exited,
		]);
		return { exitCode, stderr, stdout };
	})();
	// A plain Bun.sleep would keep running after git wins the race, holding the event loop open for
	// the rest of the timeout — up to a minute for commits. The handle is cleared either way.
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<'timeout'>((resolve) => {
		timer = setTimeout(() => resolve('timeout'), timeoutMs);
	});
	let race: 'timeout' | Awaited<typeof settled>;
	try {
		race = await Promise.race([settled, timeout]);
	} finally {
		clearTimeout(timer);
	}
	if (race === 'timeout') {
		subprocess.kill();
		return { ok: false, stderr: `git ${args[0]} timed out`, stdout: '', timedOut: true };
	}
	return { ok: race.exitCode === 0, stderr: race.stderr, stdout: race.stdout, timedOut: false };
}

/**
 * First non-empty line of git's output, used as a human-readable failure reason. stderr is checked
 * first, then stdout — some failures (`commit` with an empty index prints "nothing to commit" and
 * exits 1) report on stdout only.
 * @param output
 * @param fallback
 * @returns The reason string, or `fallback` when git printed nothing.
 */
export function gitFailureReason(output: GitOutput, fallback: string): string {
	for (const stream of [output.stderr, output.stdout]) {
		const line = stream
			.split(/\r?\n/)
			.map((entry) => entry.trim())
			.find((entry) => entry.length > 0);
		if (line) return line;
	}
	return fallback;
}
