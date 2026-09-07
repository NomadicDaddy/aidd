import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { SMOKE_QC_STEPS } from '../../scripts/smoke-qc.ts';
import { runGitWindowHide } from '../../scripts/check-git-window-hide.ts';

import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';

/**
 * This file calls the scanner rather than re-implementing it. Two copies of one rule drift to two
 * different root lists, and the gap between them can be a whole top-level directory (`skills/`)
 * holding a real unhidden spawn. The gate is delivered by `sync-shared-core.ts` from the repository
 * that owns it; these tests exercise that copy rather than restating its logic.
 *
 * The fixtures below assemble their offending line from `GIT_ARG` instead of writing it out. The
 * gate scans `test/`, so a spelled-out call would be a finding in this very file, and the only
 * ways out of that are a self-exclusion or a waiver -- both of which hide the file the tests are
 * meant to prove is visible.
 */
const GIT_ARG = "'git'";

function captureOutput(fn: () => number): { exitCode: number; output: string } {
	const originalError = console.error;
	const originalLog = console.log;
	let buffer = '';
	const collect = (...args: unknown[]) => {
		buffer += `${args.join(' ')}\n`;
	};
	console.error = collect;
	console.log = collect;
	try {
		const exitCode = fn();
		return { exitCode, output: buffer };
	} finally {
		console.error = originalError;
		console.log = originalLog;
	}
}

describe('check-git-window-hide tool', () => {
	test('passes against the current repository', () => {
		const { exitCode, output } = captureOutput(() => runGitWindowHide(process.cwd()));
		expect(exitCode).toBe(0);
		expect(output).toContain('[OK]');
	});

	test('is wired into smoke:qc steps', () => {
		const stepNames = SMOKE_QC_STEPS.map((step) => step.name);
		expect(stepNames).toContain('check:git-window-hide');
	});

	test('flags a direct spawn that omits windowsHide', async () => {
		const tmp = await testTempDir('aidd-git-window-hide-');
		try {
			await mkdir(join(tmp, 'scripts'), { recursive: true });
			await writeFile(
				join(tmp, 'scripts', 'offender.ts'),
				`Bun.spawnSync([${GIT_ARG}, 'status'], { stdout: 'pipe' });\n`,
			);

			const { exitCode, output } = captureOutput(() => runGitWindowHide(tmp));
			expect(exitCode).toBe(1);
			expect(output).toContain('scripts/offender.ts:1');
		} finally {
			await removeTempTree(tmp);
		}
	});

	test('accepts a direct spawn that passes windowsHide', async () => {
		const tmp = await testTempDir('aidd-git-window-hide-ok-');
		try {
			await mkdir(join(tmp, 'scripts'), { recursive: true });
			await writeFile(
				join(tmp, 'scripts', 'good.ts'),
				`Bun.spawnSync([${GIT_ARG}, 'status'], { windowsHide: true });\n`,
			);

			const { exitCode } = captureOutput(() => runGitWindowHide(tmp));
			expect(exitCode).toBe(0);
		} finally {
			await removeTempTree(tmp);
		}
	});

	test('scans skills/, the root the hand-rolled scanner it replaced did not cover', async () => {
		const tmp = await testTempDir('aidd-git-window-hide-skills-');
		try {
			await mkdir(join(tmp, 'skills', 'example', 'scripts'), { recursive: true });
			await writeFile(
				join(tmp, 'skills', 'example', 'scripts', 'review.ts'),
				`const r = Bun.spawnSync([${GIT_ARG}, '-C', cwd], { stderr: 'pipe' });\n`,
			);

			const { exitCode, output } = captureOutput(() => runGitWindowHide(tmp));
			expect(exitCode).toBe(1);
			expect(output).toContain('skills/example/scripts/review.ts');
		} finally {
			await removeTempTree(tmp);
		}
	});

	test('fails rather than passing when no scanned root exists', async () => {
		const tmp = await testTempDir('aidd-git-window-hide-empty-');
		try {
			const { exitCode, output } = captureOutput(() => runGitWindowHide(tmp));
			expect(exitCode).toBe(1);
			expect(output).toContain('No source files were examined');
		} finally {
			await removeTempTree(tmp);
		}
	});
});
