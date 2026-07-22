import { describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { SMOKE_QC_STEPS } from '../../scripts/smoke-qc.ts';
import { runCheckEnvSpread } from '../../scripts/check-env-spread.ts';

import { testTempDir } from '../_helpers/temp.ts';
async function captureStderr(
	fn: () => Promise<number>
): Promise<{ exitCode: number; stderr: string }> {
	const originalError = console.error;
	const originalLog = console.log;
	let buffer = '';
	console.error = (...args: unknown[]) => {
		buffer += `${args.join(' ')}\n`;
	};
	console.log = () => {};
	try {
		const exitCode = await fn();
		return { exitCode, stderr: buffer };
	} finally {
		console.error = originalError;
		console.log = originalLog;
	}
}

describe('check-env-spread tool', () => {
	test('passes against the current repository', async () => {
		const { exitCode } = await captureStderr(() => runCheckEnvSpread(process.cwd()));
		expect(exitCode).toBe(0);
	});

	test('is wired into smoke:qc steps', () => {
		const stepNames = SMOKE_QC_STEPS.map((step) => step.name);
		expect(stepNames).toContain('check:env-spread');
	});

	test('detects forbidden env-spread patterns in cli/src/', async () => {
		const tmp = await testTempDir('aidd-env-spread-');
		try {
			await mkdir(join(tmp, 'cli', 'src'), { recursive: true });
			const offending = [
				"const env = { ...process.env, FOO: 'bar' };",
				"Bun.spawn(['ls'], { env: process.env });",
			].join('\n');
			await writeFile(join(tmp, 'cli', 'src', 'offender.ts'), offending);

			const { exitCode, stderr } = await captureStderr(() => runCheckEnvSpread(tmp));
			expect(exitCode).toBe(1);
			expect(stderr).toContain('spread-process-env');
			expect(stderr).toContain('env-equals-process-env');
			expect(stderr).toContain('cli/src/offender.ts');
		} finally {
			await rm(tmp, { recursive: true, force: true });
		}
	});

	test('detects forbidden Bun.env-spread patterns in scripts/', async () => {
		const tmp = await testTempDir('aidd-bun-env-spread-');
		try {
			await mkdir(join(tmp, 'scripts'), { recursive: true });
			const offending = [
				"const env = { ...Bun.env, NO_COLOR: '1' };",
				"Bun.spawn(['ls'], { env: Bun.env });",
			].join('\n');
			await writeFile(join(tmp, 'scripts', 'offender.ts'), offending);

			const { exitCode, stderr } = await captureStderr(() => runCheckEnvSpread(tmp));
			expect(exitCode).toBe(1);
			expect(stderr).toContain('spread-bun-env');
			expect(stderr).toContain('env-equals-bun-env');
			expect(stderr).toContain('scripts/offender.ts');
		} finally {
			await rm(tmp, { recursive: true, force: true });
		}
	});

	test('honors the allow-env-spread-policy marker', async () => {
		const tmp = await testTempDir('aidd-env-spread-marker-');
		try {
			await mkdir(join(tmp, 'cli', 'src'), { recursive: true });
			// The line below mentions the forbidden shape but is annotated with the marker so the
			// scanner skips it. allow-env-spread-policy
			const annotated =
				'// describes a { ...process.env } spread for docs only // allow-env-spread-policy\n';
			await writeFile(join(tmp, 'cli', 'src', 'docs.ts'), annotated);

			const { exitCode } = await captureStderr(() => runCheckEnvSpread(tmp));
			expect(exitCode).toBe(0);
		} finally {
			await rm(tmp, { recursive: true, force: true });
		}
	});
});
