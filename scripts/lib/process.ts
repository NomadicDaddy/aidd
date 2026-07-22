interface CommandResult {
	exitCode: number;
	stderr: string;
	stdout: string;
}

interface RunCommandOptions {
	command: string[];
	cwd: string;
	env?: Record<string, string | undefined>;
	timeoutMs?: number;
}

interface RunInteractiveCommandOptions {
	command: string[];
	cwd: string;
	env?: Record<string, string | undefined>;
}

async function runCommand(options: RunCommandOptions): Promise<CommandResult> {
	const spawnOptions = {
		cwd: options.cwd,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
		...(options.env !== undefined && { env: options.env }),
	} as const;
	const timeoutMs = options.timeoutMs;
	const proc = Bun.spawn(options.command, spawnOptions);
	const stdoutPromise = new Response(proc.stdout).text();
	const stderrPromise = new Response(proc.stderr).text();

	const exit =
		timeoutMs === undefined
			? await proc.exited
			: await Promise.race([
					proc.exited,
					new Promise<'timeout'>((resolveTimeout) => {
						setTimeout(() => resolveTimeout('timeout'), timeoutMs);
					}),
				]);

	if (exit === 'timeout') {
		const timeoutSeconds = timeoutMs === undefined ? 'unknown' : String(timeoutMs / 1000);
		proc.kill();
		return {
			exitCode: -1,
			stderr: `${await stderrPromise}\nTimed out after ${timeoutSeconds}s`,
			stdout: await stdoutPromise,
		};
	}

	return {
		exitCode: exit,
		stderr: await stderrPromise,
		stdout: await stdoutPromise,
	};
}

async function runInteractiveCommand(options: RunInteractiveCommandOptions): Promise<number> {
	const spawnOptions = {
		cwd: options.cwd,
		stderr: 'inherit',
		stdout: 'inherit',
		windowsHide: true,
		...(options.env !== undefined && { env: options.env }),
	} as const;
	const proc = Bun.spawn(options.command, spawnOptions);
	return await proc.exited;
}

export { runCommand, runInteractiveCommand };
export type { CommandResult, RunCommandOptions, RunInteractiveCommandOptions };
