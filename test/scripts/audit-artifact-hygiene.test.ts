import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { SMOKE_QC_STEPS } from '../../scripts/smoke-qc.ts';
import { runAuditArtifactHygiene } from '../../scripts/check-audit-artifact-hygiene.ts';

import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';

/**
 * The gate compares report dates against the machine's local date, so a fixture with a hardcoded
 * date would start passing or failing on its own as the calendar moves. Every date below is
 * derived from `todayIso()` instead, which is the same clock the gate reads.
 */
const REPORTS = '.aidd/audit-reports';

function todayIso(): string {
	const now = new Date();
	return [
		now.getFullYear(),
		String(now.getMonth() + 1).padStart(2, '0'),
		String(now.getDate()).padStart(2, '0'),
	].join('-');
}

function isoDaysFromNow(days: number): string {
	const then = new Date();
	then.setDate(then.getDate() + days);
	return [
		then.getFullYear(),
		String(then.getMonth() + 1).padStart(2, '0'),
		String(then.getDate()).padStart(2, '0'),
	].join('-');
}

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

async function writeReport(root: string, name: string, body: string): Promise<void> {
	await mkdir(join(root, REPORTS), { recursive: true });
	await writeFile(join(root, REPORTS, name), body);
}

describe('check-audit-artifact-hygiene tool', () => {
	test('passes against the current repository', () => {
		const { exitCode, output } = captureOutput(() => runAuditArtifactHygiene(process.cwd()));
		expect(exitCode).toBe(0);
		// `.aidd/audit-reports/` is untracked local state, so this repository has reports on a
		// machine that has run an audit and none in a fresh clone. Both are passes and the shape is
		// all that differs, which is why pinning this to `[OK]` passed here and failed in CI.
		expect(output).toMatch(/\[(OK|SKIP)\]/);
	});

	test('is wired into smoke:qc steps', () => {
		const stepNames = SMOKE_QC_STEPS.map((step) => step.name);
		expect(stepNames).toContain('check:audit-artifact-hygiene');
	});

	test('accepts a report dated today', async () => {
		const tmp = await testTempDir('aidd-audit-hygiene-ok-');
		try {
			const today = todayIso();
			await writeReport(tmp, `AI-${today}.md`, `# AI audit ${today}\n\n**Date:** ${today}\n`);

			const { exitCode, output } = captureOutput(() => runAuditArtifactHygiene(tmp));
			expect(exitCode).toBe(0);
			expect(output).toContain('1 report(s)');
		} finally {
			await removeTempTree(tmp);
		}
	});

	test('flags a future date in the filename', async () => {
		const tmp = await testTempDir('aidd-audit-hygiene-name-');
		try {
			const future = isoDaysFromNow(30);
			await writeReport(tmp, `AI-${future}.md`, '# AI audit\n');

			const { exitCode, output } = captureOutput(() => runAuditArtifactHygiene(tmp));
			expect(exitCode).toBe(1);
			expect(output).toContain('filename');
			expect(output).toContain(future);
		} finally {
			await removeTempTree(tmp);
		}
	});

	test('flags a future date in the first heading and in a Date field', async () => {
		const tmp = await testTempDir('aidd-audit-hygiene-body-');
		try {
			const today = todayIso();
			const future = isoDaysFromNow(30);
			await writeReport(
				tmp,
				`AI-${today}.md`,
				`# AI audit ${future}\n\n**Date:** ${future}\n`,
			);

			const { exitCode, output } = captureOutput(() => runAuditArtifactHygiene(tmp));
			expect(exitCode).toBe(1);
			expect(output).toContain('heading');
			expect(output).toContain('date-field');
		} finally {
			await removeTempTree(tmp);
		}
	});

	/**
	 * The one case the anti-vacuity rule exempts, and the reason it is exempt: both carriers
	 * gitignore `/.aidd/`, so this directory never reaches a clone. `[SKIP]` rather than `[OK]`
	 * keeps zero reports distinguishable from a clean three hundred.
	 */
	test('skips rather than passing when the reports directory is absent', async () => {
		const tmp = await testTempDir('aidd-audit-hygiene-empty-');
		try {
			const { exitCode, output } = captureOutput(() => runAuditArtifactHygiene(tmp));
			expect(exitCode).toBe(0);
			expect(output).toContain('[SKIP]');
			expect(output).not.toContain('[OK]');
		} finally {
			await removeTempTree(tmp);
		}
	});
});
