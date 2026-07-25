import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
	ALL_TARGETS,
	type CompileTarget,
	getBinaryNames,
	resolveTargetOutDir,
	validateDistributionLayout,
} from './build-standalone.ts';

export interface CheckStandaloneArgs {
	probeBinaries: boolean;
	targets: CompileTarget[];
}

export interface ProbeResult {
	command: string;
	errorMessage: null | string;
	exitCode: null | number;
	output: string;
	passed: boolean;
	timedOut: boolean;
}

export interface StandaloneCheckResult {
	layoutIssues: string[];
	outDir: string;
	probeResults: ProbeResult[];
	probeSkippedReason: null | string;
	target: CompileTarget;
}

interface ProbeSpec {
	args: string[];
	binaryPath: string;
	expectedOutput: string;
	label: string;
}

const DEFAULT_PROBE_TIMEOUT_MS = 5_000;

export function parseCheckStandaloneArgs(argv: string[]): CheckStandaloneArgs {
	const targets: CompileTarget[] = [];
	let probeBinaries = false;

	for (let i = 0; i < argv.length; i++) {
		const token = argv[i];
		if (token === '--target') {
			const name = argv[++i];
			if (!name) throw new Error('Missing value for --target');
			const target = ALL_TARGETS.find((candidate) => candidate.name === name);
			if (!target) {
				throw new Error(
					`Unknown target: ${name}. Known: ${ALL_TARGETS.map((item) => item.name).join(', ')}`,
				);
			}
			targets.push(target);
		} else if (token === '--probe-binaries') {
			probeBinaries = true;
		} else {
			throw new Error(`Unknown argument: ${token}`);
		}
	}

	return {
		probeBinaries,
		targets: targets.length > 0 ? targets : ALL_TARGETS,
	};
}

export function canProbeTarget(
	target: CompileTarget,
	platform: NodeJS.Platform = process.platform,
	arch = process.arch,
): boolean {
	if (target.name.startsWith('bun-windows-')) return platform === 'win32';
	if (target.name.startsWith('bun-linux-')) return platform === 'linux';
	if (target.name === 'bun-darwin-arm64') return platform === 'darwin' && arch === 'arm64';
	return false;
}

export function createProbeSpecs(outDir: string, target: CompileTarget): ProbeSpec[] {
	const binaries = getBinaryNames(target);
	const cliPath = join(outDir, binaries.cli);
	const webPath = join(outDir, binaries.web);
	return [
		{
			args: ['--version'],
			binaryPath: cliPath,
			expectedOutput: 'aidd v',
			label: `${binaries.cli} --version`,
		},
		{
			args: ['--help'],
			binaryPath: cliPath,
			expectedOutput: 'Usage:',
			label: `${binaries.cli} --help`,
		},
		{
			args: ['--version'],
			binaryPath: webPath,
			expectedOutput: 'aidd-web v',
			label: `${binaries.web} --version`,
		},
		{
			args: ['--help'],
			binaryPath: webPath,
			expectedOutput: 'Usage: aidd-web',
			label: `${binaries.web} --help`,
		},
	];
}

export async function runProbe(
	spec: ProbeSpec,
	cwd: string,
	timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
): Promise<ProbeResult> {
	if (!existsSync(spec.binaryPath)) {
		return {
			command: spec.label,
			errorMessage: `missing binary: ${spec.binaryPath}`,
			exitCode: null,
			output: '',
			passed: false,
			timedOut: false,
		};
	}

	const proc = Bun.spawn([spec.binaryPath, ...spec.args], {
		cwd,
		stderr: 'pipe',
		stdout: 'pipe',
	});
	const stdout = new Response(proc.stdout).text();
	const stderr = new Response(proc.stderr).text();
	let timeout: ReturnType<typeof setTimeout> | undefined;
	const timeoutResult = new Promise<'timeout'>((resolve) => {
		timeout = setTimeout(() => resolve('timeout'), timeoutMs);
	});
	const exitResult = await Promise.race([proc.exited, timeoutResult]);
	const timedOut = exitResult === 'timeout';
	if (timedOut) {
		proc.kill();
	}
	if (timeout) clearTimeout(timeout);
	const exitCode = timedOut ? await proc.exited.catch(() => null) : exitResult;
	const output = `${await stdout}${await stderr}`.trim();
	const passed = !timedOut && exitCode === 0 && output.includes(spec.expectedOutput);
	return {
		command: spec.label,
		errorMessage: passed
			? null
			: probeFailureMessage(spec.expectedOutput, exitCode, timedOut, output),
		exitCode,
		output,
		passed,
		timedOut,
	};
}

export async function checkStandaloneDistributions(
	rootDir: string,
	args: CheckStandaloneArgs,
): Promise<StandaloneCheckResult[]> {
	const results: StandaloneCheckResult[] = [];

	for (const target of args.targets) {
		const outDir = resolveTargetOutDir(rootDir, target);
		const layoutIssues = await validateDistributionLayout(outDir, target);
		let probeSkippedReason: null | string = null;
		let probeResults: ProbeResult[] = [];

		if (args.probeBinaries) {
			if (layoutIssues.length > 0) {
				probeSkippedReason = 'layout validation failed';
			} else if (!canProbeTarget(target)) {
				probeSkippedReason = `target is not executable on ${process.platform}/${process.arch}`;
			} else {
				probeResults = await Promise.all(
					createProbeSpecs(outDir, target).map((spec) => runProbe(spec, outDir)),
				);
			}
		}

		results.push({
			layoutIssues,
			outDir,
			probeResults,
			probeSkippedReason,
			target,
		});
	}

	return results;
}

export function hasStandaloneCheckFailure(results: StandaloneCheckResult[]): boolean {
	return results.some(
		(result) =>
			result.layoutIssues.length > 0 ||
			result.probeResults.some((probeResult) => !probeResult.passed),
	);
}

export function formatStandaloneCheckResults(results: StandaloneCheckResult[]): string {
	const lines = ['[check-standalone] target summary'];
	for (const result of results) {
		if (result.layoutIssues.length === 0) {
			lines.push(`[PASS] ${result.target.name} layout -> ${result.outDir}`);
		} else {
			lines.push(`[FAIL] ${result.target.name} layout -> ${result.outDir}`);
			lines.push(...result.layoutIssues.map((issue) => `  - ${issue}`));
		}

		if (result.probeSkippedReason) {
			lines.push(`[SKIP] ${result.target.name} probes: ${result.probeSkippedReason}`);
		}
		for (const probeResult of result.probeResults) {
			if (probeResult.passed) {
				lines.push(`[PASS] ${result.target.name} probe: ${probeResult.command}`);
			} else {
				lines.push(
					`[FAIL] ${result.target.name} probe: ${probeResult.command}: ${probeResult.errorMessage}`,
				);
			}
		}
	}
	return lines.join('\n');
}

export async function main(
	argv: string[] = process.argv.slice(2),
	rootDir = process.cwd(),
): Promise<number> {
	let args: CheckStandaloneArgs;
	try {
		args = parseCheckStandaloneArgs(argv);
	} catch (err) {
		console.error(`Error: ${errorMessage(err)}`);
		return 2;
	}

	const results = await checkStandaloneDistributions(rootDir, args);
	console.log(formatStandaloneCheckResults(results));
	return hasStandaloneCheckFailure(results) ? 1 : 0;
}

function probeFailureMessage(
	expectedOutput: string,
	exitCode: null | number,
	timedOut: boolean,
	output: string,
): string {
	if (timedOut) return `timed out before printing ${expectedOutput}`;
	if (exitCode !== 0) return `exited ${exitCode}; expected output containing ${expectedOutput}`;
	return `output did not include ${expectedOutput}: ${output}`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

if (import.meta.main) {
	process.exit(await main());
}
