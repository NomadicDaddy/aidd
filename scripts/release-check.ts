import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cwd, exit } from 'node:process';

import { ALL_TARGETS, type CompileTarget } from './build-standalone.ts';
import {
	checkStandaloneDistributions,
	formatStandaloneCheckResults,
	hasStandaloneCheckFailure,
} from './check-standalone.ts';
import {
	runCommand,
	runInteractiveCommand,
	type RunInteractiveCommandOptions,
} from './lib/process.ts';
import {
	assertVersionParity,
	errorMessage,
	readVersionInfo,
	REQUIRED_PUBLIC_FILES,
} from './lib/release/common.ts';

interface ReleaseCheckArgs {
	allowDirty: boolean;
	skipCommandGates: boolean;
	targets: CompileTarget[];
}

type InteractiveRunner = (options: RunInteractiveCommandOptions) => Promise<number>;

const COMMAND_GATES: { command: string[]; label: string }[] = [
	{
		command: ['bun', 'run', 'start', '--', '--project-dir', '.', '--check-features'],
		label: 'feature metadata gate',
	},
	{
		command: ['bun', 'run', 'start', '--', '--project-dir', '.', '--check-artifacts'],
		label: 'artifact freshness gate',
	},
	{ command: ['bun', 'scripts/run-tests.ts'], label: 'bun test' },
	{ command: ['bun', 'run', 'build:frontend'], label: 'build:frontend' },
	{ command: ['bun', 'run', 'smoke:qc'], label: 'smoke:qc' },
];

export function parseReleaseCheckArgs(argv: string[]): ReleaseCheckArgs {
	const targets: CompileTarget[] = [];
	let allowDirty = false;
	let skipCommandGates = false;
	for (let i = 0; i < argv.length; i++) {
		const token = argv[i];
		if (token === '--allow-dirty') {
			allowDirty = true;
		} else if (token === '--all-targets') {
			targets.splice(0, targets.length, ...ALL_TARGETS);
		} else if (token === '--skip-command-gates') {
			skipCommandGates = true;
		} else if (token === '--target') {
			const targetName = argv[++i];
			if (!targetName) throw new Error('Missing value for --target');
			const target = ALL_TARGETS.find((item) => item.name === targetName);
			if (!target) {
				throw new Error(
					`Unknown target: ${targetName}. Known: ${ALL_TARGETS.map((item) => item.name).join(', ')}`,
				);
			}
			targets.push(target);
		} else {
			throw new Error(`Unknown argument: ${token}`);
		}
	}
	return {
		allowDirty,
		skipCommandGates,
		// Default to the Windows target so `release:package && release:check`
		// with no args stays consistent (packaging is Windows-only by default);
		// widen with --target or --all-targets.
		targets: targets.length > 0 ? targets : [windowsTarget()],
	};
}

function windowsTarget(): CompileTarget {
	const target = ALL_TARGETS.find((item) => item.name === 'bun-windows-x64-modern');
	if (!target) throw new Error('Missing Windows standalone target');
	return target;
}

export async function runReleaseCheck(
	rootDir: string,
	args: ReleaseCheckArgs,
	commandRunner: InteractiveRunner = runInteractiveCommand,
): Promise<number> {
	const issues: string[] = [];
	issues.push(...(await checkGitStatus(rootDir, args.allowDirty)));
	issues.push(...(await checkVersionAndFiles(rootDir)));

	const standalone = await checkStandaloneDistributions(rootDir, {
		probeBinaries: false,
		targets: args.targets,
	});
	console.log(formatStandaloneCheckResults(standalone));
	if (hasStandaloneCheckFailure(standalone)) {
		issues.push('standalone distribution layout is incomplete');
	}

	if (issues.length > 0) {
		console.error(formatIssues(issues));
		return 1;
	}

	if (!args.skipCommandGates) {
		const gates = [
			{
				command: [
					'bun',
					'run',
					'check:release-notices',
					'--',
					...args.targets.flatMap((target) => ['--target', target.name]),
				],
				label: 'release archive gate',
			},
			...COMMAND_GATES,
		];
		for (const gate of gates) {
			console.log(`[release-check] ${gate.label}`);
			const exitCode = await commandRunner({ command: gate.command, cwd: rootDir });
			if (exitCode !== 0) {
				console.error(`[release-check] ${gate.label} failed with exit code ${exitCode}`);
				return exitCode;
			}
		}
	}

	console.log('[release-check] release checks passed');
	return 0;
}

export async function main(argv = Bun.argv.slice(2), rootDir = cwd()): Promise<number> {
	try {
		return await runReleaseCheck(rootDir, parseReleaseCheckArgs(argv));
	} catch (err) {
		console.error(`Error: ${errorMessage(err)}`);
		return 2;
	}
}

async function checkGitStatus(rootDir: string, allowDirty: boolean): Promise<string[]> {
	if (allowDirty) return [];
	const result = await runCommand({ command: ['git', 'status', '--short'], cwd: rootDir });
	if (result.exitCode !== 0) {
		return [`git status failed: ${result.stderr || result.stdout}`];
	}
	return result.stdout.trim().length === 0
		? []
		: [`working tree is not clean:\n${result.stdout.trim()}`];
}

async function checkVersionAndFiles(rootDir: string): Promise<string[]> {
	const issues = assertVersionParity(await readVersionInfo(rootDir));
	for (const relativePath of REQUIRED_PUBLIC_FILES) {
		if (!existsSync(join(rootDir, relativePath))) {
			issues.push(`missing required public file: ${relativePath}`);
		}
	}
	return issues;
}

function formatIssues(issues: string[]): string {
	return ['[release-check] release checks failed:', ...issues.map((issue) => `- ${issue}`)].join(
		'\n',
	);
}

if (import.meta.main) {
	exit(await main());
}
