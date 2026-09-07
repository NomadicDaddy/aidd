import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { stderr as processStderr, stdout as processStdout } from 'node:process';

import type { SmokeQcStep } from './steps.ts';

import { hashStepDependencies } from '../smoke-cache/collect.ts';

/**
 * Retention for the one smoke:qc step that emits diagnostics nothing else can reconstruct.
 *
 * Every other step is a static check whose output is its verdict: rerun it and you get the same
 * report. `build:frontend` is not — Vite's deprecation notices, ignored-option warnings, and
 * emission diagnostics are produced once, scroll past on an inherited stream, and are gone. Worse,
 * the step is cached, so the next run does not even rerun it. This tees that run to a stable
 * artifact so the warnings survive the console they were printed to.
 *
 * The artifact lives under `data/`, which `scripts/lib/smoke-cache/collect.ts` excludes from every
 * dependency hash. That is deliberate: writing diagnostics must never change what the build cache
 * sees, so retention can neither create a cache miss nor stand in for one.
 */
const BUILD_DIAGNOSTICS_STEP_NAME = 'build:frontend';

/** Repository-relative, so console messages name the path a reader can open. */
export const BUILD_DIAGNOSTICS_RELATIVE_PATH = join('data', 'smoke-qc', 'build-frontend.log');

interface ByteSink {
	write: (chunk: Uint8Array) => boolean;
}

export interface DiagnosticsSinks {
	stderr: ByteSink;
	stdout: ByteSink;
}

interface BuildDiagnostics {
	command: string[];
	/**
	 * The build cache key for the inputs as they stood when the build ran, so a retained artifact
	 * can be matched to the tree that produced it. `null` when a declared input has gone missing.
	 */
	dependencyHash: null | string;
	exitCode: number;
	stderr: string;
	stdout: string;
	timestamp: string;
}

export function buildDiagnosticsPath(projectRoot: string): string {
	return join(projectRoot, BUILD_DIAGNOSTICS_RELATIVE_PATH);
}

export function capturesBuildDiagnostics(stepName: string): boolean {
	return stepName === BUILD_DIAGNOSTICS_STEP_NAME;
}

function formatBuildDiagnostics(diagnostics: BuildDiagnostics): string {
	const outcome = diagnostics.exitCode === 0 ? 'success' : 'failure';
	return [
		'# smoke:qc build diagnostics',
		`# timestamp: ${diagnostics.timestamp}`,
		`# command: ${diagnostics.command.join(' ')}`,
		`# dependency-hash: ${diagnostics.dependencyHash ?? 'unavailable'}`,
		`# exit-status: ${outcome} (exit code ${diagnostics.exitCode})`,
		'',
		'--- stdout ---',
		diagnostics.stdout,
		'--- stderr ---',
		diagnostics.stderr,
	].join('\n');
}

/** Reads the stream to completion, forwarding every chunk to the console it was bound for. */
async function teeStream(stream: ReadableStream<Uint8Array>, sink: ByteSink): Promise<string> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let text = '';

	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value === undefined) continue;
		sink.write(value);
		// Streamed decode: a multi-byte character split across two chunks would otherwise be
		// written to the artifact as replacement characters.
		text += decoder.decode(value, { stream: true });
	}

	return text + decoder.decode();
}

/**
 * Runs the step with its output teed to both the console and the diagnostics artifact, and returns
 * its exit code. The artifact is written for a failed build as well as a successful one — a failure
 * is when its warnings matter most, and a gate that discarded them there would retain nothing worth
 * having.
 */
export async function runStepWithBuildDiagnostics(
	step: SmokeQcStep,
	projectRoot: string,
	sinks: DiagnosticsSinks = { stderr: processStderr, stdout: processStdout },
): Promise<number> {
	const child = Bun.spawn(step.command, {
		cwd: projectRoot,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});

	const [stdout, stderr, exitCode] = await Promise.all([
		teeStream(child.stdout, sinks.stdout),
		teeStream(child.stderr, sinks.stderr),
		child.exited,
	]);

	const outputPath = buildDiagnosticsPath(projectRoot);
	await mkdir(dirname(outputPath), { recursive: true });
	await writeFile(
		outputPath,
		formatBuildDiagnostics({
			command: step.command,
			dependencyHash: await hashStepDependencies(projectRoot, step.name),
			exitCode,
			stderr,
			stdout,
			timestamp: new Date().toISOString(),
		}),
		'utf8',
	);

	return exitCode;
}
