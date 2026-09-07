import { describe, expect, test } from 'bun:test';

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	BUILD_DIAGNOSTICS_RELATIVE_PATH,
	buildDiagnosticsPath,
	capturesBuildDiagnostics,
	type DiagnosticsSinks,
	runStepWithBuildDiagnostics,
} from '../../scripts/lib/smoke-qc/build-diagnostics.ts';
import type { SmokeQcStep } from '../../scripts/lib/smoke-qc/steps.ts';

import { testTempDir } from '../_helpers/temp.ts';

// The diagnostics header carries the build step's cache key, so the fixture needs real declared
// inputs: hashing an empty tree yields the same digest for every fixture and would make the
// header assertion pass without ever reading a file.
async function createBuildProject(): Promise<string> {
	const root = await testTempDir('aidd-build-diagnostics-');
	await writeFile(join(root, 'package.json'), '{"name":"fixture"}\n');
	await writeFile(join(root, 'bun.lock'), '');
	return root;
}

function createSink(): { text: () => string; write: (chunk: Uint8Array) => boolean } {
	const decoder = new TextDecoder();
	let text = '';
	return {
		text: () => text,
		write: (chunk: Uint8Array) => {
			text += decoder.decode(chunk);
			return true;
		},
	};
}

function createSinks(): { sinks: DiagnosticsSinks; stderr: () => string; stdout: () => string } {
	const stderr = createSink();
	const stdout = createSink();
	return { sinks: { stderr, stdout }, stderr: stderr.text, stdout: stdout.text };
}

/** A step whose command is inline Bun, so the capture runs a real subprocess with real streams. */
function inlineStep(source: string): SmokeQcStep {
	return {
		command: ['bun', '-e', source],
		description: 'Build fixture',
		label: 'build:frontend',
		name: 'build:frontend',
	};
}

async function readDiagnostics(root: string): Promise<string> {
	return await readFile(buildDiagnosticsPath(root), 'utf8');
}

describe('smoke:qc build diagnostics', () => {
	test('captures a successful build to the artifact while still printing it', async () => {
		const root = await createBuildProject();
		const { sinks, stdout } = createSinks();

		const exitCode = await runStepWithBuildDiagnostics(
			inlineStep('console.log("vite v7 building for production")'),
			root,
			sinks,
		);
		const artifact = await readDiagnostics(root);

		expect(exitCode).toBe(0);
		expect(stdout()).toContain('vite v7 building for production');
		expect(artifact).toContain('vite v7 building for production');
		expect(artifact).toContain('# exit-status: success (exit code 0)');
		expect(artifact).toContain('# command: bun -e');
		expect(artifact).toMatch(/# dependency-hash: [0-9a-f]{64}\n/);
		expect(artifact).toMatch(/# timestamp: \d{4}-\d{2}-\d{2}T[\d:.]+Z\n/);
	});

	test('retains stderr diagnostics the console would otherwise scroll past', async () => {
		const root = await createBuildProject();
		const { sinks, stderr, stdout } = createSinks();

		await runStepWithBuildDiagnostics(
			inlineStep(
				'console.log("built in 4.20s"); console.error("warning: \\"as\\" is deprecated")',
			),
			root,
			sinks,
		);
		const artifact = await readDiagnostics(root);
		const stderrSection = artifact.slice(artifact.indexOf('--- stderr ---'));

		expect(stderr()).toContain('warning: "as" is deprecated');
		expect(stdout()).not.toContain('warning: "as" is deprecated');
		expect(stderrSection).toContain('warning: "as" is deprecated');
		expect(artifact.slice(0, artifact.indexOf('--- stderr ---'))).toContain('built in 4.20s');
	});

	test('retains the artifact for a failed build, which is when it matters most', async () => {
		const root = await createBuildProject();
		const { sinks } = createSinks();

		const exitCode = await runStepWithBuildDiagnostics(
			inlineStep('console.error("[vite]: Rollup failed to resolve import"); process.exit(1)'),
			root,
			sinks,
		);
		const artifact = await readDiagnostics(root);

		expect(exitCode).toBe(1);
		expect(artifact).toContain('# exit-status: failure (exit code 1)');
		expect(artifact).toContain('[vite]: Rollup failed to resolve import');
	});

	test('captures the build step only, and writes beneath the unhashed data tree', async () => {
		expect(capturesBuildDiagnostics('build:frontend')).toBe(true);
		expect(capturesBuildDiagnostics('typecheck')).toBe(false);
		expect(BUILD_DIAGNOSTICS_RELATIVE_PATH.replaceAll('\\', '/')).toBe(
			'data/smoke-qc/build-frontend.log',
		);
	});
});
