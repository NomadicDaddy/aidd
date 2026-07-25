export type RunCommandSource = 'exact' | 'reconstructed';

export interface RunLaunchCommand {
	args: string[];
	display: string;
	source: RunCommandSource;
}

const barePowerShellArgPattern = /^[A-Za-z0-9._:/\\@=+-]+$/;

function quotePowerShellArg(value: string): string {
	if (value.length > 0 && barePowerShellArgPattern.test(value)) return value;
	return `'${value.replaceAll("'", "''")}'`;
}

export function formatRunCommandArgs(args: readonly string[]): string {
	return args.map(quotePowerShellArg).join(' ');
}

export function buildRunLaunchCommand(
	args: readonly string[],
	source: RunCommandSource,
): null | RunLaunchCommand {
	if (args.length === 0) return null;
	const normalized = args.map((arg) => String(arg));
	return {
		args: normalized,
		display: formatRunCommandArgs(normalized),
		source,
	};
}
