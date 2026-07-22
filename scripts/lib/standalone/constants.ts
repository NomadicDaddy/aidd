export type CompileTargetName =
	'bun-darwin-arm64' | 'bun-linux-x64-modern' | 'bun-windows-x64-modern';

export interface CompileTarget {
	name: CompileTargetName;
	suffix: '.exe' | '';
}

export interface CliArgs {
	skipFrontend: boolean;
	targets: CompileTarget[];
}

export interface BuildTargetResult {
	errorMessage: null | string;
	outDir: string;
	status: 'failed' | 'success';
	target: CompileTarget;
}

export type CommandRunner = (command: string[], cwd: string) => Promise<void>;

export interface BuildTargetOptions {
	commandRunner?: CommandRunner;
}

export interface RequiredDistributionEntry {
	kind: 'directory' | 'file';
	path: string;
}

export const ALL_TARGETS: CompileTarget[] = [
	{ name: 'bun-windows-x64-modern', suffix: '.exe' },
	{ name: 'bun-linux-x64-modern', suffix: '' },
	{ name: 'bun-darwin-arm64', suffix: '' },
];

export const CORE_CATALOG_DIRS: string[] = [
	'audits',
	'skills',
	'scaffolding',
	'prompts',
	'recipes',
];

export const REQUIRED_FILE_ASSETS: string[] = [
	'VERSION',
	'config.json.example',
	'LICENSE',
	'THIRD-PARTY-LICENSES.md',
];

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
