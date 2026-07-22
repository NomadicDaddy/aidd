import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import {
	buildWriteAllowlistRetryPrompt,
	captureWriteGuardSnapshot,
	diffWriteViolations,
	isPathAllowlisted,
	revertWriteViolations,
} from '../../shared/src/pipeline/writeAllowlist';

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

describe('write-allowlist guard', () => {
	test('isPathAllowlisted matches prefixes and normalizes separators', () => {
		expect(isPathAllowlisted('.aidd/spec.md', ['.aidd'])).toBe(true);
		expect(isPathAllowlisted('.aidd', ['.aidd'])).toBe(true);
		expect(isPathAllowlisted('.aidd2/spec.md', ['.aidd'])).toBe(false);
		expect(isPathAllowlisted('src/index.ts', ['.aidd'])).toBe(false);
		expect(isPathAllowlisted('.aidd\\reports\\x.md', ['.aidd/'])).toBe(true);
		expect(isPathAllowlisted('docs/x.md', ['.aidd', 'docs'])).toBe(true);
	});

	test('snapshot returns null outside a git repository', async () => {
		const dir = await testTempDir('aidd-wal-nogit-');
		expect(await captureWriteGuardSnapshot(dir)).toBeNull();
	});

	test('detects violations, reverts new files and tracked modifications', async () => {
		const dir = await makeRepo('aidd-wal-revert-');
		const baseline = await captureWriteGuardSnapshot(dir);
		if (!baseline) throw new Error('Expected git snapshot');

		await mkdir(join(dir, '.aidd'), { recursive: true });
		await writeFile(join(dir, '.aidd', 'notes.md'), 'allowed\n', 'utf8');
		await writeFile(join(dir, 'rogue.ts'), 'new file\n', 'utf8');
		await writeFile(join(dir, 'tracked.ts'), 'mutated\n', 'utf8');

		const violations = await diffWriteViolations(dir, ['.aidd'], baseline);
		if (!violations) throw new Error('Expected violations diff');
		expect(violations.map((violation) => violation.path).sort()).toEqual([
			'rogue.ts',
			'tracked.ts',
		]);

		const failed = await revertWriteViolations(dir, baseline, violations);
		expect(failed).toEqual([]);
		expect(await Bun.file(join(dir, 'tracked.ts')).text()).toBe('original\n');
		expect(await Bun.file(join(dir, 'rogue.ts')).exists()).toBe(false);
		expect(await Bun.file(join(dir, '.aidd', 'notes.md')).exists()).toBe(true);

		const after = await diffWriteViolations(dir, ['.aidd'], baseline);
		expect(after).toEqual([]);
	});

	test('detects and reverts violations the backend committed (HEAD moved)', async () => {
		const dir = await makeRepo('aidd-wal-committed-');
		const baseline = await captureWriteGuardSnapshot(dir);
		if (!baseline) throw new Error('Expected git snapshot');

		// Simulate a backend that writes both an allowed and a forbidden file and
		// commits them together — the exact GLM force-commit behavior intake hit.
		await mkdir(join(dir, '.aidd'), { recursive: true });
		await writeFile(join(dir, '.aidd', 'changelog.md'), 'allowed\n', 'utf8');
		await writeFile(join(dir, 'pwned.txt'), 'forbidden\n', 'utf8');
		await git(dir, 'add', '-A');
		await git(dir, 'commit', '-m', 'backend work');

		const violations = await diffWriteViolations(dir, ['.aidd'], baseline);
		if (!violations) throw new Error('Expected violations diff');
		expect(violations.map((violation) => violation.path)).toEqual(['pwned.txt']);
		expect(violations[0]?.committed).toBe(true);

		const failed = await revertWriteViolations(dir, baseline, violations);
		expect(failed).toEqual([]);
		expect(await Bun.file(join(dir, 'pwned.txt')).exists()).toBe(false);
		// Legitimate committed .aidd work is preserved as an uncommitted change.
		expect(await Bun.file(join(dir, '.aidd', 'changelog.md')).exists()).toBe(true);
		const after = await diffWriteViolations(dir, ['.aidd'], baseline);
		expect(after).toEqual([]);
	});

	test('pre-existing dirt outside the allowlist is baselined, not flagged', async () => {
		const dir = await makeRepo('aidd-wal-baseline-');
		await writeFile(join(dir, 'tracked.ts'), 'dirty before run\n', 'utf8');
		const baseline = await captureWriteGuardSnapshot(dir);
		if (!baseline) throw new Error('Expected git snapshot');
		const violations = await diffWriteViolations(dir, ['.aidd'], baseline);
		expect(violations).toEqual([]);
	});

	test('detects git reset --hard that discards baseline-dirty paths', async () => {
		const dir = await makeRepo('aidd-wal-destructive-');
		// Uncommitted modification to a tracked file outside .aidd/. (reset --hard only
		// touches tracked files; untracked-file discard via `git clean` is covered below.)
		await writeFile(join(dir, 'tracked.ts'), 'operator modification\n', 'utf8');
		const baseline = await captureWriteGuardSnapshot(dir);
		if (!baseline) throw new Error('Expected git snapshot');

		// Simulate a destructive operation: git reset --hard discards the tracked modification.
		await git(dir, 'reset', '--hard', 'HEAD');

		const violations = await diffWriteViolations(dir, ['.aidd'], baseline);
		if (!violations) throw new Error('Expected violations diff');
		expect(violations.map((v) => v.path)).toEqual(['tracked.ts']);
		expect(violations.every((v) => v.destructivelyDiscarded === true)).toBe(true);
	});

	test('detects git clean that discards untracked baseline paths', async () => {
		const dir = await makeRepo('aidd-wal-clean-');
		// Untracked operator file.
		await writeFile(join(dir, 'scratch.txt'), 'operator scratch\n', 'utf8');
		const baseline = await captureWriteGuardSnapshot(dir);
		if (!baseline) throw new Error('Expected git snapshot');

		// git clean -fd removes untracked files.
		await git(dir, 'clean', '-fd');

		const violations = await diffWriteViolations(dir, ['.aidd'], baseline);
		if (!violations) throw new Error('Expected violations diff');
		expect(violations.map((v) => v.path)).toEqual(['scratch.txt']);
		expect(violations[0]?.destructivelyDiscarded).toBe(true);
	});

	test('revert restores destructively discarded tracked file from baseline HEAD', async () => {
		const dir = await makeRepo('aidd-wal-revert-destructive-');
		await writeFile(join(dir, 'tracked.ts'), 'operator modification\n', 'utf8');
		const baseline = await captureWriteGuardSnapshot(dir);
		if (!baseline) throw new Error('Expected git snapshot');

		await git(dir, 'reset', '--hard', 'HEAD');

		const violations = await diffWriteViolations(dir, ['.aidd'], baseline);
		if (!violations) throw new Error('Expected violations diff');

		const failed = await revertWriteViolations(dir, baseline, violations);
		expect(failed).toEqual([]);
		// Tracked file is restored to the committed version (best-effort recovery).
		expect(await Bun.file(join(dir, 'tracked.ts')).text()).toBe('original\n');
	});

	test('destructive operation inside .aidd/ is not flagged', async () => {
		const dir = await makeRepo('aidd-wal-destructive-allow-');
		await mkdir(join(dir, '.aidd'), { recursive: true });
		await writeFile(join(dir, '.aidd', 'notes.md'), 'metadata write\n', 'utf8');
		const baseline = await captureWriteGuardSnapshot(dir);
		if (!baseline) throw new Error('Expected git snapshot');

		// Discarding the .aidd/ file is allowlisted.
		await git(dir, 'clean', '-fd');

		const violations = await diffWriteViolations(dir, ['.aidd'], baseline);
		// .aidd/notes.md was baseline-dirty and is now gone, but it's allowlisted.
		expect(violations).toEqual([]);
	});

	test('retry prompt names the allowlist and the violating paths', () => {
		const prompt = buildWriteAllowlistRetryPrompt(
			'original prompt',
			['.aidd'],
			[
				{
					committed: false,
					destructivelyDiscarded: false,
					path: 'src/evil.ts',
					untracked: true,
				},
			]
		);
		expect(prompt).toContain('WRITE ALLOWLIST RETRY');
		expect(prompt).toContain('- .aidd/');
		expect(prompt).toContain('- src/evil.ts');
		expect(prompt.endsWith('original prompt')).toBe(true);
	});
});
