import { describe, expect, test } from 'bun:test';

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { parseReleaseNoticeArgs } from '../../scripts/check-release-notices.ts';
import { testTempDir } from '../_helpers/temp.ts';

/** Runs the real gate as the release path runs it, and reports how it exited. */
async function runGate(dir: string): Promise<{ exitCode: number; output: string }> {
	const proc = Bun.spawn(['bun', 'scripts/check-release-notices.ts', '--dir', dir], {
		cwd: process.cwd(),
		stderr: 'pipe',
		stdout: 'pipe',
	});
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	return { exitCode: await proc.exited, output: `${stdout}${stderr}` };
}

describe('check:release-notices fails closed with no artifact to inspect', () => {
	test('parses a selected target and rejects unknown arguments', () => {
		expect(
			parseReleaseNoticeArgs(['--target', 'bun-windows-x64-modern']).targets.map(
				(target) => target.name,
			),
		).toEqual(['bun-windows-x64-modern']);
		// The rejection now comes from node:util parseArgs in strict mode, not a hand-rolled loop.
		expect(() => parseReleaseNoticeArgs(['--unknown'])).toThrow('Unknown option');
	});

	test('exits non-zero when the release directory does not exist', async () => {
		const { exitCode, output } = await runGate(join('dist', 'release-does-not-exist'));

		expect(exitCode).not.toBe(0);
		expect(output).toContain('No built release found');
	});

	test('exits non-zero when the directory exists but holds no archive', async () => {
		const dir = await testTempDir('release-notices-empty');
		try {
			await mkdir(join(dir, 'staged'), { recursive: true });
			// A staging tree is not an artifact: the gate must open the zip users download.
			await writeFile(join(dir, 'staged', 'LICENSE'), 'MIT\n');

			const { exitCode, output } = await runGate(dir);

			expect(exitCode).not.toBe(0);
			expect(output).toContain('release ZIPs must be exactly');
		} finally {
			await removeTempTree(dir);
		}
	});
});
