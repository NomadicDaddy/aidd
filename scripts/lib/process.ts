interface RunInteractiveCommandOptions {
	command: string[];
	cwd: string;
	env?: Record<string, string | undefined>;
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

export { runInteractiveCommand };
export type { RunInteractiveCommandOptions };
