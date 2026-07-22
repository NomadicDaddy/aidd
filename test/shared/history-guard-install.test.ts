import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { ensureHistoryGuard } from '../../shared/src/metadata/history-guard.ts';
import { testTempDirSync } from '../_helpers/temp.ts';

// The guard is installed where .aidd/ is created, not where git is initialized — because only one
// of the four ingestion lanes inits git. These cases pin that seam's behaviour, especially the
// `Ingest Existing` shape: a repository that already exists and already has a remote.
const AIDD_ROOT = resolve(import.meta.dir, '..', '..');
const tmpRoot = testTempDirSync('guard-install');
let seq = 0;

const git = (cwd: string, args: string[]): string => {
	const p = Bun.spawnSync(['git', '-C', cwd, ...args], { windowsHide: true });
	return new TextDecoder().decode(p.stdout).trim();
};

const makeRepo = async (name: string, opts: { remote?: boolean } = {}): Promise<string> => {
	const dir = join(tmpRoot, `${name}-${seq++}`);
	await mkdir(dir, { recursive: true });
	git(dir, ['init', '-q', '-b', 'main', '.']);
	if (opts.remote === true)
		git(dir, ['remote', 'add', 'origin', 'https://example.invalid/x.git']);
	return dir;
};

const indexMode = (dir: string): string =>
	git(dir, ['ls-files', '-s', '.githooks/pre-push']).split(/\s+/)[0] ?? '';

describe('ensureHistoryGuard', () => {
	test('Ingest Existing: guards a pre-existing repo that already has a remote', async () => {
		// The lane that inits no git and needs the guard most.
		const dir = await makeRepo('ingest', { remote: true });
		expect(await ensureHistoryGuard(dir, AIDD_ROOT)).toBe('installed');
		expect(existsSync(join(dir, '.githooks', 'pre-push'))).toBe(true);
		expect(existsSync(join(dir, '.githooks', 'aidd-history-guard.sh'))).toBe(true);
		expect(git(dir, ['config', 'core.hooksPath'])).toBe('.githooks');
		expect(indexMode(dir)).toBe('100755');
	});

	test('guards a remote-less repo too — dormant, but armed the moment a remote appears', async () => {
		const dir = await makeRepo('managed');
		expect(await ensureHistoryGuard(dir, AIDD_ROOT)).toBe('installed');
		expect(indexMode(dir)).toBe('100755');
	});

	test('is idempotent — both seams may call it for the same project', async () => {
		const dir = await makeRepo('twice');
		expect(await ensureHistoryGuard(dir, AIDD_ROOT)).toBe('installed');
		expect(await ensureHistoryGuard(dir, AIDD_ROOT)).toBe('installed');
		expect(indexMode(dir)).toBe('100755');
	});

	test('a non-repo directory is left alone', async () => {
		const dir = join(tmpRoot, `plain-${seq++}`);
		await mkdir(dir, { recursive: true });
		expect(await ensureHistoryGuard(dir, AIDD_ROOT)).toBe('not-a-repo');
		expect(existsSync(join(dir, '.githooks'))).toBe(false);
	});

	test('a project nested inside someone else’s repo is NOT guarded', async () => {
		// Rewriting a parent repository's hooks from a subdirectory would be an act of vandalism.
		const parent = await makeRepo('parent');
		const nested = join(parent, 'sub');
		await mkdir(nested, { recursive: true });
		expect(await ensureHistoryGuard(nested, AIDD_ROOT)).toBe('not-a-repo');
		expect(existsSync(join(parent, '.githooks'))).toBe(false);
	});

	test('stages BOTH files — a lone wrapper would reference a script that is not in the repo', async () => {
		const dir = await makeRepo('both-staged');
		expect(await ensureHistoryGuard(dir, AIDD_ROOT)).toBe('installed');
		const staged = git(dir, ['diff', '--cached', '--name-only']).split('\n');
		expect(staged).toContain('.githooks/pre-push');
		expect(staged).toContain('.githooks/aidd-history-guard.sh');
	});

	test('refuses to hijack Husky — an existing core.hooksPath is never redirected', async () => {
		// core.hooksPath holds ONE value. Pointing it at .githooks silently disables whatever it
		// named before, and `Ingest Existing` aims this at arbitrary third-party repositories.
		const dir = await makeRepo('husky');
		await mkdir(join(dir, '.husky'), { recursive: true });
		await writeFile(join(dir, '.husky', 'pre-commit'), '#!/bin/sh\necho lint\n');
		git(dir, ['config', 'core.hooksPath', '.husky']);

		expect(await ensureHistoryGuard(dir, AIDD_ROOT)).toBe('foreign-hooks-path');
		expect(git(dir, ['config', 'core.hooksPath'])).toBe('.husky');
		expect(existsSync(join(dir, '.githooks'))).toBe(false);
	});

	test('refuses to orphan real hooks living in .git/hooks', async () => {
		// With core.hooksPath unset git runs .git/hooks; redirecting would strand them.
		const dir = await makeRepo('legacy-hooks');
		const hooks = join(dir, '.git', 'hooks');
		await mkdir(hooks, { recursive: true });
		await writeFile(join(hooks, 'pre-commit'), '#!/bin/sh\necho legacy\n');
		expect(await ensureHistoryGuard(dir, AIDD_ROOT)).toBe('foreign-hooks-path');
		expect(git(dir, ['config', 'core.hooksPath'])).toBe('');
	});

	test('git ships inert *.sample hooks — those must not block installation', async () => {
		const dir = await makeRepo('samples-only');
		const hooks = join(dir, '.git', 'hooks');
		await mkdir(hooks, { recursive: true });
		await writeFile(join(hooks, 'pre-commit.sample'), '#!/bin/sh\nexit 0\n');
		expect(await ensureHistoryGuard(dir, AIDD_ROOT)).toBe('installed');
	});

	test('refuses to clobber a foreign pre-push hook', async () => {
		// core.hooksPath allows exactly one; silently replacing it would disable whatever it did.
		const dir = await makeRepo('foreign');
		await mkdir(join(dir, '.githooks'), { recursive: true });
		await writeFile(join(dir, '.githooks', 'pre-push'), '#!/usr/bin/env bash\necho mine\n');
		expect(await ensureHistoryGuard(dir, AIDD_ROOT)).toBe('foreign-hook');
		expect(await Bun.file(join(dir, '.githooks', 'pre-push')).text()).toContain('echo mine');
	});

	test('a missing guard source degrades instead of throwing', async () => {
		const dir = await makeRepo('no-source');
		expect(await ensureHistoryGuard(dir, join(tmpRoot, 'nowhere'))).toBe('no-source');
	});
});
