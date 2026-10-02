import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import {
	captureWriteGuardSnapshot,
	diffWriteViolations,
	revertWriteViolations,
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

// Found by the 2026-10-01 destructive-git audit. Git reported a staged move as one line,
// `R  a -> b`, and the status parser kept only `b`, so the path the run removed was in no list.
describe('write-allowlist guard - a renamed file', () => {
	test('a tracked file moved into the allowed directory is a violation on its source', async () => {
		const dir = await makeRepo('aidd-wal-rename-in-');
		const baseline = await captureWriteGuardSnapshot(dir);
		if (!baseline) throw new Error('Expected git snapshot');

		await mkdir(join(dir, '.aidd'), { recursive: true });
		await git(dir, 'mv', 'tracked.ts', '.aidd/tracked.ts');

		const violations = await diffWriteViolations(dir, ['.aidd'], baseline);
		expect(violations?.map((violation) => violation.path)).toEqual(['tracked.ts']);
	});

	test('reverting a move outside the allowed directory restores the original', async () => {
		const dir = await makeRepo('aidd-wal-rename-out-');
		const baseline = await captureWriteGuardSnapshot(dir);
		if (!baseline) throw new Error('Expected git snapshot');

		await git(dir, 'mv', 'tracked.ts', 'renamed.ts');

		const violations = await diffWriteViolations(dir, ['.aidd'], baseline);
		if (!violations) throw new Error('Expected violations diff');
		expect(violations.map((violation) => violation.path)).toEqual(['renamed.ts', 'tracked.ts']);

		const failed = await revertWriteViolations(dir, baseline, violations, 'isolated');
		expect(failed).toEqual([]);
		expect(await Bun.file(join(dir, 'tracked.ts')).text()).toBe('original\n');
		expect(await Bun.file(join(dir, 'renamed.ts')).exists()).toBe(false);
		expect(await diffWriteViolations(dir, ['.aidd'], baseline)).toEqual([]);
	});
});
