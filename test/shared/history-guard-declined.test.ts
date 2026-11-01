import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { ensureHistoryGuard } from '../../shared/src/metadata/history-guard.ts';
import { testTempDirSync } from '../_helpers/temp.ts';

// A Director run on github-profile (2026-10-23) re-installed and staged six hook files that
// Phillip's own commit 8bf69bf had removed from that public repository. Its clone still had
// core.hooksPath = .githooks from before the removal, and it ignores /.aidd/, so there was nothing
// to guard. A repository that decided against the hooks keeps that decision.
const AIDD_ROOT = resolve(import.meta.dir, '..', '..');
const tmpRoot = testTempDirSync('guard-declined');
let seq = 0;

const git = (cwd: string, args: string[]): string => {
	const p = Bun.spawnSync(['git', '-C', cwd, ...args], { windowsHide: true });
	return new TextDecoder().decode(p.stdout).trim();
};

async function makeRepo(name: string): Promise<string> {
	const dir = join(tmpRoot, `${name}-${seq++}`);
	await mkdir(dir, { recursive: true });
	git(dir, ['init', '-q', '-b', 'main', '.']);
	git(dir, ['config', 'user.email', 'test@example.invalid']);
	git(dir, ['config', 'user.name', 'test']);
	git(dir, ['config', 'commit.gpgsign', 'false']);
	return dir;
}

async function commitFile(dir: string, path: string, body: string, message: string): Promise<void> {
	await mkdir(join(dir, path, '..'), { recursive: true });
	await writeFile(join(dir, path), body);
	git(dir, ['add', '--', path]);
	git(dir, ['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', message]);
}

const staged = (dir: string): string => git(dir, ['diff', '--cached', '--name-only']);

describe('ensureHistoryGuard leaves a repository that declined it alone', () => {
	test('the github-profile shape: hooks committed, then removed, hooksPath still set', async () => {
		const dir = await makeRepo('removed');
		await commitFile(dir, '.githooks/pre-push', '#!/bin/sh\n', 'hooks');
		git(dir, ['config', 'core.hooksPath', '.githooks']);
		git(dir, ['rm', '-q', '--', '.githooks/pre-push']);
		git(dir, ['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'cleanup']);
		expect(await ensureHistoryGuard(dir, AIDD_ROOT)).toBe('removed-by-project');
		expect(existsSync(join(dir, '.githooks'))).toBe(false);
		expect(staged(dir)).toBe('');
	});

	test('a repository that ignores .aidd/ gets no guard', async () => {
		const dir = await makeRepo('ignored');
		await commitFile(dir, '.gitignore', '/.aidd/\n', 'ignore aidd');
		expect(await ensureHistoryGuard(dir, AIDD_ROOT)).toBe('aidd-ignored');
		expect(existsSync(join(dir, '.githooks'))).toBe(false);
		expect(staged(dir)).toBe('');
	});

	test('a fresh scaffold, which ignores only some .aidd subfolders, is still guarded', async () => {
		const dir = await makeRepo('scaffold');
		await commitFile(dir, '.gitignore', '.aidd/reports/\n.aidd/docs/\n', 'scaffold ignores');
		expect(await ensureHistoryGuard(dir, AIDD_ROOT)).toBe('installed');
		expect(existsSync(join(dir, '.githooks', 'pre-push'))).toBe(true);
	});

	test('a brand-new repository whose scaffold ignores /.aidd/ is guarded', async () => {
		// The scaffold has carried /.aidd/ since db44af5b, and a project's first commit comes after
		// this runs: with no history yet, nobody has decided anything.
		const dir = await makeRepo('fresh');
		await writeFile(join(dir, '.gitignore'), '/.aidd/\n');
		expect(await ensureHistoryGuard(dir, AIDD_ROOT)).toBe('installed');
		expect(existsSync(join(dir, '.githooks', 'pre-push'))).toBe(true);
		expect(existsSync(join(dir, '.githooks', 'leak-guard.sh'))).toBe(true);
	});

	test('a repository on an unborn orphan branch still has commits, so its decline stands', async () => {
		const dir = await makeRepo('orphan');
		await commitFile(dir, '.gitignore', '/.aidd/\n', 'ignore aidd');
		git(dir, ['checkout', '-q', '--orphan', 'fresh-start']);
		expect(await ensureHistoryGuard(dir, AIDD_ROOT)).toBe('aidd-ignored');
		expect(existsSync(join(dir, '.githooks'))).toBe(false);
	});

	test('a repository that tracks the guard keeps being guarded even when it ignores .aidd/', async () => {
		const dir = await makeRepo('tracked');
		await commitFile(dir, '.gitignore', '/.aidd/\n', 'ignore aidd');
		expect(await ensureHistoryGuard(dir, AIDD_ROOT)).toBe('aidd-ignored');
		await commitFile(dir, '.githooks/pre-push', '#!/bin/sh\n', 'own hook');
		expect(await ensureHistoryGuard(dir, AIDD_ROOT)).not.toBe('aidd-ignored');
	});
});
