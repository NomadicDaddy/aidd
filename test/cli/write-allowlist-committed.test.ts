import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { describeWriteGuardRevert } from '../../shared/src/pipeline/write-allowlist/describe.ts';
import {
	captureWriteGuardSnapshot,
	diffWriteViolations,
} from '../../shared/src/pipeline/writeAllowlist.ts';
import { testTempDir } from '../_helpers/temp.ts';

async function git(cwd: string, ...args: string[]): Promise<void> {
	const proc = Bun.spawn(['git', ...args], {
		cwd,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	const code = await proc.exited;
	if (code !== 0) {
		throw new Error(`git ${args.join(' ')} failed: ${await new Response(proc.stderr).text()}`);
	}
}

async function makeRepo(prefix: string): Promise<string> {
	const dir = await testTempDir(prefix);
	await git(dir, 'init');
	await git(dir, 'config', 'user.email', 'test@test');
	await git(dir, 'config', 'user.name', 'test');
	await git(dir, 'config', 'core.autocrlf', 'false');
	await writeFile(join(dir, 'tracked.ts'), 'original\n', 'utf8');
	await git(dir, 'add', 'tracked.ts');
	await git(dir, 'commit', '-m', 'init');
	return dir;
}

// bbs-load-tester, 2026-10-21: the owner had staged a hook suite before a metadata-only intake run,
// the run's commit swept the staged files in, and the guard reported them "deleted and NOT
// recoverable (it was never committed)" while they sat committed on disk.
describe('write-allowlist guard - a baseline-staged file the run commits', () => {
	test('is a committed violation, not a discarded one', async () => {
		const dir = await makeRepo('aidd-wal-staged-committed-');
		await mkdir(join(dir, '.githooks'), { recursive: true });
		await writeFile(join(dir, '.githooks', 'pre-push'), '#!/usr/bin/env bash\n', 'utf8');
		await git(dir, 'add', '.githooks/pre-push');
		const baseline = await captureWriteGuardSnapshot(dir);
		if (!baseline) throw new Error('Expected git snapshot');

		await git(dir, 'commit', '-m', 'the run commits everything staged');

		const violations = await diffWriteViolations(dir, ['.aidd'], baseline);
		if (!violations) throw new Error('Expected violations diff');
		expect(violations).toEqual([
			{
				committed: true,
				destructivelyDiscarded: false,
				path: '.githooks/pre-push',
				untracked: false,
			},
		]);
		const text = describeWriteGuardRevert(violations, [], 'shared');
		expect(text).toContain('NOT reverted, left as they are');
		expect(text).not.toContain('NOT recoverable');
		expect(await Bun.file(join(dir, '.githooks', 'pre-push')).exists()).toBe(true);
	});
});
