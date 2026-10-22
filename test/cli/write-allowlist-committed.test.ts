import { mkdir, rm, writeFile } from 'node:fs/promises';
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

	// Morticia's Low on 4d5fcf17: a file untracked at baseline (`??`) has no unstaged part to lose
	// once the run commits it.
	test('an untracked baseline file the run commits whole is not reported as discarded', async () => {
		const dir = await makeRepo('aidd-wal-untracked-committed-');
		await writeFile(join(dir, 'notes.txt'), 'operator notes\n', 'utf8');
		const baseline = await captureWriteGuardSnapshot(dir);
		if (!baseline) throw new Error('Expected git snapshot');

		await git(dir, 'add', 'notes.txt');
		await git(dir, 'commit', '-m', 'the run commits the untracked file');

		const violations = await diffWriteViolations(dir, ['.aidd'], baseline);
		if (!violations) throw new Error('Expected violations diff');
		expect(violations).toEqual([
			{ committed: true, destructivelyDiscarded: false, path: 'notes.txt', untracked: false },
		]);
		expect(describeWriteGuardRevert(violations, [], 'shared')).not.toContain('discarded');
	});

	// Roger's converse (#18582): `MM` at baseline, and the run stages the rest and commits it all,
	// so the commit holds exactly what was on disk and nothing was lost.
	test('an MM file the run commits whole is not reported as discarded', async () => {
		const dir = await makeRepo('aidd-wal-mm-whole-');
		await writeFile(join(dir, 'tracked.ts'), 'staged edit\n', 'utf8');
		await git(dir, 'add', 'tracked.ts');
		await writeFile(join(dir, 'tracked.ts'), 'staged edit\nunstaged edit\n', 'utf8');
		const baseline = await captureWriteGuardSnapshot(dir);
		if (!baseline) throw new Error('Expected git snapshot');

		await git(dir, 'add', 'tracked.ts');
		await git(dir, 'commit', '-m', 'the run commits all of it');

		const violations = await diffWriteViolations(dir, ['.aidd'], baseline);
		if (!violations) throw new Error('Expected violations diff');
		expect(violations).toEqual([
			{
				committed: true,
				destructivelyDiscarded: false,
				path: 'tracked.ts',
				untracked: false,
			},
		]);
	});

	// Morticia's Low on c5a4972c: with staged and unstaged edits at baseline (`MM`), the commit
	// holds only the staged part, so a later discard of the rest is a loss the guard must report.
	test('still reports the unstaged edits a discard lost after the commit', async () => {
		const dir = await makeRepo('aidd-wal-mixed-committed-');
		await writeFile(join(dir, 'tracked.ts'), 'staged edit\n', 'utf8');
		await git(dir, 'add', 'tracked.ts');
		await writeFile(join(dir, 'tracked.ts'), 'staged edit\nunstaged edit\n', 'utf8');
		const baseline = await captureWriteGuardSnapshot(dir);
		if (!baseline) throw new Error('Expected git snapshot');

		await git(dir, 'commit', '-m', 'the run commits the staged part');
		await git(dir, 'checkout', '--', 'tracked.ts');

		const violations = await diffWriteViolations(dir, ['.aidd'], baseline);
		if (!violations) throw new Error('Expected violations diff');
		expect(violations).toEqual([
			{
				committed: true,
				destructivelyDiscarded: true,
				path: 'tracked.ts',
				untracked: false,
			},
		]);
		const text = describeWriteGuardRevert(violations, [], 'shared');
		expect(text).toContain('uncommitted edits were discarded and are NOT restored');
		expect(text).not.toContain('NOT recoverable');
	});

	// Roger's Medium and Morticia's Low on 1c433ff3: a baseline file that could not be hashed is
	// unverifiable, not absent, so deleting it must still be reported.
	test('a file whose baseline hash failed is reported when the run deletes it', async () => {
		const dir = await makeRepo('aidd-wal-unhashed-');
		// A required clean filter that always fails makes `git hash-object` refuse the file.
		await git(dir, 'config', 'filter.broken.clean', 'false');
		await git(dir, 'config', 'filter.broken.required', 'true');
		await writeFile(join(dir, '.gitattributes'), 'scratch.txt filter=broken\n', 'utf8');
		await writeFile(join(dir, 'scratch.txt'), 'operator scratch\n', 'utf8');
		const baseline = await captureWriteGuardSnapshot(dir);
		if (!baseline) throw new Error('Expected git snapshot');
		expect(baseline.blobs.get('scratch.txt')).toBeNull();

		await rm(join(dir, 'scratch.txt'));

		const violations = await diffWriteViolations(dir, ['.aidd'], baseline);
		if (!violations) throw new Error('Expected violations diff');
		expect(violations).toEqual([
			{
				committed: false,
				destructivelyDiscarded: true,
				path: 'scratch.txt',
				untracked: true,
			},
		]);
	});
});
