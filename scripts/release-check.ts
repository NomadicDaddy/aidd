#!/usr/bin/env bun
/**
 * release-check.ts
 *
 * Asserts that this repository is releasable: the working tree is clean, every file that claims a
 * version agrees on it, the required public files are present, the standalone distribution layout
 * is complete, and each command gate the release depends on passes.
 *
 * Enforces: a release is only cut from a clean tree whose version claims agree and whose
 * distribution layout is complete. No assertion ID: `.aidd/` files the release checks under the
 * release runbook rather than under an ASSERT- number.
 *
 * Run: bun run release:check [--allow-dirty] [--skip-command-gates] [--all-targets]
 *                            [--target <name>]...
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cwd, exit } from 'node:process';
import { parseArgs } from 'node:util';

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

/**
 * Parse the gate's arguments. Throws on anything unrecognized, which the caller maps onto exit 2.
 *
 * `--all-targets` and `--target` both write the same slot, and `--all-targets` wins regardless of
 * order: it is the wider request, so a run that names both is asking for every target rather than
 * for whichever flag happened to come last.
 */
export function parseReleaseCheckArgs(argv: string[]): ReleaseCheckArgs {
	const { values } = parseArgs({
		args: argv,
		options: {
			'all-targets': { type: 'boolean' },
			'allow-dirty': { type: 'boolean' },
			'skip-command-gates': { type: 'boolean' },
			target: { multiple: true, type: 'string' },
		},
		strict: true,
	});

	const named = (values.target ?? []).map((targetName) => {
		const target = ALL_TARGETS.find((item) => item.name === targetName);
		if (!target) {
			throw new Error(
				`Unknown target: ${targetName}. Known: ${ALL_TARGETS.map((item) => item.name).join(', ')}`,
			);
		}
		return target;
	});

	// Default to the Windows target so `release:package && release:check` with no args stays
	// consistent (packaging is Windows-only by default); widen with --target or --all-targets.
	let targets = named.length > 0 ? named : [windowsTarget()];
	if (values['all-targets'] === true) targets = [...ALL_TARGETS];

	return {
		allowDirty: values['allow-dirty'] === true,
		skipCommandGates: values['skip-command-gates'] === true,
		targets,
	};
}

function windowsTarget(): CompileTarget {
	const target = ALL_TARGETS.find((item) => item.name === 'bun-windows-x64-modern');
	if (!target) throw new Error('Missing Windows standalone target');
	return target;
}

/**
 * Run the gate. Returns the process exit code: 0 pass, 1 findings, 2 could not run.
 *
 * A command gate's own exit code is mapped rather than propagated. A gate that exits 2 could not
 * determine its answer, so neither can this one and 2 is passed along; any other non-zero code is a
 * finding it reported, which is a finding here too. Propagating an arbitrary code verbatim would
 * put values outside the sanctioned three into the release runbook's exit status.
 */
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

	const gates = args.skipCommandGates
		? []
		: [
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
			console.error(`[FAIL] release:check -- ${gate.label} exited ${exitCode}`);
			return exitCode === 2 ? 2 : 1;
		}
	}

	console.log(
		`[OK] release:check -- ${args.targets.length} standalone target(s) and ` +
			`${REQUIRED_PUBLIC_FILES.length} required public file(s) checked, ` +
			`${gates.length} command gate(s) run.`,
	);
	return 0;
}

export async function main(argv = Bun.argv.slice(2), rootDir = cwd()): Promise<number> {
	try {
		return await runReleaseCheck(rootDir, parseReleaseCheckArgs(argv));
	} catch (err) {
		// Bad arguments and an unexpected throw share exit 2: neither is a release problem this
		// gate found, and both mean it never got as far as looking.
		console.error(`[FAIL] release:check -- ${errorMessage(err)}`);
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
	return [
		`[FAIL] release:check -- ${issues.length} issue(s):`,
		...issues.map((issue) => `- ${issue}`),
	].join('\n');
}

if (import.meta.main) {
	exit(await main());
}
