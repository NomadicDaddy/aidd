import { fileChangePathLimit } from 'aidd-shared/runs/file-changes';
import { isAbsolute, relative, resolve } from 'node:path';

export interface ResidualDirtySourceClassification {
	attributed: string[];
	unattributed: string[];
}

function normalizedProjectPath(projectDir: string, path: string): string | undefined {
	const projectRoot = resolve(projectDir);
	const normalized =
		isAbsolute(path) || /^[A-Za-z]:[\\/]/.test(path)
			? relative(projectRoot, resolve(path)).replaceAll('\\', '/')
			: path.replaceAll('\\', '/').replace(/^\.\/+/, '');
	if (
		normalized === '' ||
		normalized === '..' ||
		normalized.startsWith('../') ||
		isAbsolute(normalized)
	) {
		return undefined;
	}
	return normalized;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function commandNamesProjectPath(command: string, projectDir: string, path: string): boolean {
	const normalizedCommand = command.replaceAll('\\', '/');
	const absolutePath = resolve(projectDir, path).replaceAll('\\', '/');
	const candidates = [path, `./${path}`, absolutePath];
	const boundary = `[\\s"'=,:;()\\[\\]{}<>|&]`;
	return candidates.some((candidate) => {
		const pattern = new RegExp(`(?:^|${boundary})${escapeRegExp(candidate)}(?=$|${boundary})`);
		return pattern.test(normalizedCommand);
	});
}

/** Partition newly dirty source paths by evidence recorded by this run. A file-change tool event
 * naming the path or an exact path mention in a recorded shell command attributes the residue to
 * the run. Baseline-only paths are excluded before this helper is called. */
export function classifyResidualDirtySourcePaths(input: {
	commandsRun: ReadonlySet<string>;
	dirtyNow: readonly string[];
	dirtySourcePathsAtStart: ReadonlySet<string>;
	projectDir: string;
	runRecordedPaths: ReadonlySet<string>;
}): ResidualDirtySourceClassification {
	const normalizedRecordedPaths = new Set(
		[...input.runRecordedPaths]
			.map((path) => normalizedProjectPath(input.projectDir, path))
			.filter((path): path is string => path !== undefined),
	);
	const attributed: string[] = [];
	const unattributed: string[] = [];
	for (const path of input.dirtyNow) {
		if (input.dirtySourcePathsAtStart.has(path)) continue;
		const runAttributed =
			normalizedRecordedPaths.has(path) ||
			[...input.commandsRun].some((command) =>
				commandNamesProjectPath(command, input.projectDir, path),
			);
		(runAttributed ? attributed : unattributed).push(path);
	}
	const sortPaths = (paths: string[]) =>
		paths.sort((left, right) => left.localeCompare(right)).slice(0, fileChangePathLimit);
	return {
		attributed: sortPaths(attributed),
		unattributed: sortPaths(unattributed),
	};
}
