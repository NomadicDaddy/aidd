interface BashArgs {
	command: string;
	timeout_ms?: number;
}

export async function bash(args: BashArgs, cwd: string): Promise<string> {
	const timeout = args.timeout_ms ?? 120_000;

	try {
		const proc = Bun.spawn(['bash', '-c', args.command], {
			cwd,
			stdout: 'pipe',
			stderr: 'pipe',
			env: { ...process.env },
		});

		const timer = setTimeout(() => proc.kill(), timeout);

		const [stdout, stderr] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);
		const exitCode = await proc.exited;

		clearTimeout(timer);

		let result = '';
		if (stdout) result += stdout;
		if (stderr) result += (result ? '\n' : '') + `STDERR:\n${stderr}`;
		result += `\n[exit code: ${exitCode}]`;

		// Cap output to avoid blowing context
		if (result.length > 50_000) {
			result = result.substring(0, 50_000) + '\n... (output truncated at 50000 chars)';
		}

		return result;
	} catch (err) {
		return `ERROR: Failed to execute command: ${err instanceof Error ? err.message : String(err)}`;
	}
}
