import { buildRunLaunchCommand, type RunLaunchCommand } from 'aidd-shared/runs/command';

interface ReconstructableRunCommand {
	backend: string;
	mode: string;
	model: null | string;
	projectPath: string;
	reasoningEffort: null | string;
}

function parseExactCommandArgs(raw: null | string): null | string[] {
	if (raw === null) return null;
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return null;
		if (parsed.some((item) => typeof item !== 'string')) return null;
		return parsed;
	} catch {
		return null;
	}
}

function reconstructedModeArgs(mode: string): null | string[] {
	if (mode === 'audit') return ['--audit-all'];
	if (mode === 'directive') return ['--directive'];
	if (mode === 'interview') return ['--interview'];
	if (mode === 'todo') return ['--todo'];
	if (mode === 'triumvirate') return ['--triumvirate'];
	if (mode === 'validate') return ['--validate'];
	if (mode === 'coding') return [];
	return null;
}

export function reconstructedRunCommand(run: ReconstructableRunCommand): null | RunLaunchCommand {
	const modeArgs = reconstructedModeArgs(run.mode);
	if (modeArgs === null) return null;
	const args = ['aidd', '--project-dir', run.projectPath, ...modeArgs, '--cli', run.backend];
	if (run.model) args.push('--model', run.model);
	if (run.reasoningEffort) args.push('--reasoning-effort', run.reasoningEffort);
	return buildRunLaunchCommand(args, 'reconstructed');
}

export function storedOrReconstructedRunCommand(
	commandArgsJson: null | string,
	run: ReconstructableRunCommand,
): null | RunLaunchCommand {
	const exactArgs = parseExactCommandArgs(commandArgsJson);
	if (exactArgs) return buildRunLaunchCommand(exactArgs, 'exact');
	return reconstructedRunCommand(run);
}

export function exactOrReconstructedRunCommand(
	commandArgs: null | readonly string[],
	run: ReconstructableRunCommand,
): null | RunLaunchCommand {
	if (commandArgs && commandArgs.length > 0) return buildRunLaunchCommand(commandArgs, 'exact');
	return reconstructedRunCommand(run);
}
