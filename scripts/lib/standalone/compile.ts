import { ALL_TARGETS, type CliArgs, type CommandRunner, type CompileTarget } from './constants.ts';

export function parseArgs(argv: string[]): CliArgs {
	let targets = [...ALL_TARGETS];
	let skipFrontend = false;
	for (let i = 0; i < argv.length; i++) {
		const token = argv[i];
		if (token === '--target') {
			const name = argv[++i];
			if (!name) {
				throw new Error('Missing value for --target');
			}
			const match = ALL_TARGETS.find((t) => t.name === name);
			if (!match) {
				throw new Error(
					`Unknown target: ${name}. Known: ${ALL_TARGETS.map((t) => t.name).join(', ')}`
				);
			}
			targets = [match];
		} else if (token === '--skip-frontend') {
			skipFrontend = true;
		} else {
			throw new Error(`Unknown argument: ${token}`);
		}
	}
	return { skipFrontend, targets };
}

export async function runCommand(command: string[], cwd: string): Promise<void> {
	const [program, ...rest] = command;
	if (!program) throw new Error('runCommand requires a program');
	const proc = Bun.spawn([program, ...rest], {
		cwd,
		stderr: 'inherit',
		stdin: 'inherit',
		stdout: 'inherit',
	});
	const code = await proc.exited;
	if (code !== 0) {
		throw new Error(`Command failed (exit ${code}): ${command.join(' ')}`);
	}
}

export function createCompileCommand(
	target: CompileTarget,
	entrypoint: string,
	outfile: string,
	extraFlags: string[],
	extraEntrypoints: string[] = []
): string[] {
	// The main entrypoint must come first; extra entrypoints (e.g. worker
	// modules referenced via `new Worker(...)` at runtime) are bundled into the
	// executable as separately loadable modules.
	return [
		'bun',
		'build',
		'--compile',
		`--target=${target.name}`,
		'--outfile',
		outfile,
		...extraFlags,
		entrypoint,
		...extraEntrypoints,
	];
}

export function webCompileFlagsForTarget(target: CompileTarget): string[] {
	return target.name.startsWith('bun-windows-') ? ['--windows-hide-console'] : [];
}

export async function compile(
	rootDir: string,
	target: CompileTarget,
	entrypoint: string,
	outfile: string,
	extraFlags: string[],
	commandRunner: CommandRunner = runCommand,
	extraEntrypoints: string[] = []
): Promise<void> {
	await commandRunner(
		createCompileCommand(target, entrypoint, outfile, extraFlags, extraEntrypoints),
		rootDir
	);
}
