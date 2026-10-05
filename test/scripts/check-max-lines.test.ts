import { describe, expect, test } from 'bun:test';

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runCheckMaxLines } from '../../scripts/check-max-lines.ts';
import { testTempDir } from '../_helpers/temp.ts';

function sourceWithLines(count: number): string {
	return Array.from(
		{ length: count },
		(_, index) => `export const line${index} = ${index};`,
	).join('\n');
}

const ROOTS = ['cli/src', 'backend/src', 'frontend/src', 'shared/src', 'scripts'];

async function scaffoldRoots(root: string, except?: string): Promise<void> {
	for (const dir of ROOTS) {
		if (dir !== except) await mkdir(join(root, dir), { recursive: true });
	}
}

async function writeSource(root: string, name: string, lines: number): Promise<void> {
	const sourceDir = join(root, 'cli', 'src');
	await mkdir(sourceDir, { recursive: true });
	await writeFile(join(sourceDir, name), sourceWithLines(lines));
}

describe('check:max-lines warning tier', () => {
	test('warns at 290 lines without changing the successful exit contract', async () => {
		const root = await testTempDir('max-lines-warning-');
		await scaffoldRoots(root);
		await writeSource(root, 'safe.ts', 289);
		await writeSource(root, 'warning.ts', 290);
		await writeSource(root, 'ceiling.ts', 300);
		const warnings: string[] = [];
		const logs: string[] = [];
		const originalWarn = console.warn;
		const originalLog = console.log;
		console.warn = (...args: unknown[]) => void warnings.push(args.join(' '));
		console.log = (...args: unknown[]) => void logs.push(args.join(' '));
		try {
			expect(await runCheckMaxLines(root)).toBe(0);
		} finally {
			console.warn = originalWarn;
			console.log = originalLog;
		}

		expect(warnings.join('\n')).toContain('[WARN] aidd max-lines check: 2 file(s)');
		expect(warnings.join('\n')).toContain('cli/src/warning.ts:290');
		expect(warnings.join('\n')).toContain('cli/src/ceiling.ts:300');
		expect(warnings.join('\n')).not.toContain('safe.ts');
		expect(logs.join('\n')).toContain('[OK] aidd max-lines check passed');
	});

	test('retains 300 lines as the hard ceiling', async () => {
		const root = await testTempDir('max-lines-failure-');
		await writeSource(root, 'oversized.ts', 301);
		const errors: string[] = [];
		const originalError = console.error;
		console.error = (...args: unknown[]) => void errors.push(args.join(' '));
		try {
			expect(await runCheckMaxLines(root)).toBe(1);
		} finally {
			console.error = originalError;
		}

		expect(errors.join('\n')).toContain('[FAIL] aidd max-lines check: 1 file(s)');
		expect(errors.join('\n')).toContain('cli/src/oversized.ts:301 (max 300)');
	});

	// A renamed root used to be skipped silently: its whole tree left the check, and the remaining
	// roots kept it green.
	test('a missing scanned root fails by name', async () => {
		const root = await testTempDir('max-lines-missing-root-');
		await scaffoldRoots(root, 'backend/src');
		await writeSource(root, 'small.ts', 10);
		const errors: string[] = [];
		const originalError = console.error;
		console.error = (...args: unknown[]) => void errors.push(args.join(' '));
		try {
			expect(await runCheckMaxLines(root)).toBe(1);
		} finally {
			console.error = originalError;
		}

		expect(errors.join(' ')).toContain('scanned root(s) missing: backend/src');
	});
});
