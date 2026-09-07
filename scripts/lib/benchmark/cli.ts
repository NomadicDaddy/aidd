import path from 'node:path';

import type { BenchmarkArgs, BenchmarkStack, BenchmarkTask } from './types.ts';

import {
	benchmarkDirtyTreeThreshold,
	cliEntryPath,
	defaultManifestPath,
	defaultResultsDir,
	defaultWorkspacesDir,
} from './constants.ts';

function readRequiredArg(argv: string[], index: number, flag: string): string {
	const value = argv[index + 1];
	if (!value) throw new Error(`${flag} requires a value`);
	return value;
}

export function parseBenchmarkArgs(argv: string[]): BenchmarkArgs {
	const args: BenchmarkArgs = {
		dryRun: false,
		manifest: defaultManifestPath,
		regrade: false,
		reportOnly: false,
		resultsDir: defaultResultsDir,
		selectedStacks: [],
		selectedTasks: [],
		skipPreflight: false,
		workspacesDir: defaultWorkspacesDir,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const flag = argv[index] ?? '';
		switch (flag) {
			case '--dry-run':
				args.dryRun = true;
				break;
			case '--help':
			case '-h':
				printHelp();
				process.exit(0);
				break;
			case '--manifest':
				args.manifest = path.resolve(readRequiredArg(argv, index, flag));
				index += 1;
				break;
			case '--regrade':
				args.regrade = true;
				break;
			case '--report-only':
				args.reportOnly = true;
				break;
			case '--results-dir':
				args.resultsDir = path.resolve(readRequiredArg(argv, index, flag));
				index += 1;
				break;
			case '--seed':
				args.seed = readRequiredArg(argv, index, flag);
				index += 1;
				break;
			case '--skip-preflight':
				args.skipPreflight = true;
				break;
			case '--stack':
				args.selectedStacks.push(readRequiredArg(argv, index, flag));
				index += 1;
				break;
			case '--task':
				args.selectedTasks.push(readRequiredArg(argv, index, flag));
				index += 1;
				break;
			case '--workspaces-dir':
				args.workspacesDir = path.resolve(readRequiredArg(argv, index, flag));
				index += 1;
				break;
			default:
				throw new Error(`Unknown benchmark option: ${flag}`);
		}
	}
	return args;
}

export function splitCommandLine(command: string): string[] {
	const args: string[] = [];
	let current = '';
	let quote: '"' | "'" | undefined;
	let escaped = false;
	for (let index = 0; index < command.length; index += 1) {
		const char = command[index] ?? '';
		if (escaped) {
			current += char;
			escaped = false;
			continue;
		}
		if (char === '\\') {
			escaped = true;
			continue;
		}
		if (quote !== undefined) {
			if (char === quote) {
				quote = undefined;
			} else {
				current += char;
			}
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (/\s/.test(char)) {
			if (current) {
				args.push(current);
				current = '';
			}
			continue;
		}
		current += char;
	}
	if (escaped) current += '\\';
	if (quote !== undefined) throw new Error(`Unclosed quote in command: ${command}`);
	if (current) args.push(current);
	return args;
}

export function buildAiddInvocation(
	stack: BenchmarkStack,
	task: BenchmarkTask,
	workspaceDir: string,
): { args: string[]; command: string } {
	const args = [
		cliEntryPath,
		'--project-dir',
		workspaceDir,
		'--cli',
		stack.cli,
		'--timeout',
		String(task.timeoutSeconds),
		'--model',
		stack.model,
		'--no-clean',
		'--no-work-backoff-ms',
		'0',
		'--dirty-tree-threshold',
		benchmarkDirtyTreeThreshold,
	];
	if (stack.reasoningEffort) args.push('--reasoning-effort', stack.reasoningEffort);
	if (stack.thinking === true) args.push('--thinking');
	else if (stack.thinking === false) args.push('--no-thinking');
	if (stack.thinkingLevel) args.push('--thinking-level', stack.thinkingLevel);
	if (stack.simulation) args.push('--simulation');
	args.push(...splitCommandLine(task.command));
	return { args, command: 'bun' };
}

export function printHelp(): void {
	console.log(`aidd benchmark harness

Usage:
  bun scripts/run-benchmark.ts [options]

Options:
  --manifest <path>       Benchmark manifest path
  --results-dir <path>    Directory for session.json, runs.jsonl, leaderboard, and report
  --workspaces-dir <path> Directory for disposable fixture workspaces
  --stack <label>         Limit to a stack label; repeatable
  --task <id>             Limit to a task id; repeatable
  --seed <value>          Deterministic run ordering
  --dry-run               Validate and print the planned run matrix
  --report-only           Rebuild leaderboard/report from existing runs.jsonl
  --regrade               Re-evaluate saved workspaces and rebuild reports
  --skip-preflight        Skip preflight checks
  -h, --help              Show this help text`);
}
