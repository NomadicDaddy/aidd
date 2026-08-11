import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
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

	test('stages the wrapper AND every guard it sources — a lone wrapper references scripts not in the repo', async () => {
		const dir = await makeRepo('both-staged');
		expect(await ensureHistoryGuard(dir, AIDD_ROOT)).toBe('installed');
		const staged = git(dir, ['diff', '--cached', '--name-only']).split('\n');
		expect(staged).toContain('.githooks/pre-push');

		// Derive the invariant from the wrapper itself: whatever guard scripts pre-push invokes
		// (`bash "$hooks_dir/<name>"`) MUST have been copied in and staged. This fails the moment a
		// guard is added to scaffolding/.githooks/pre-push without teaching ensureHistoryGuard to
		// ship it — the exact break that let a pre-push reference a missing screenshot-guard.sh.
		const wrapper = readFileSync(join(dir, '.githooks', 'pre-push'), 'utf8');
		const sourced = [...wrapper.matchAll(/\$hooks_dir\/([\w.-]+)/g)]
			.map((m) => m[1])
			.filter((n): n is string => n !== undefined);
		expect(sourced).toContain('aidd-history-guard.sh');
		expect(sourced).toContain('screenshot-guard.sh');
		for (const guard of sourced) {
			expect(existsSync(join(dir, '.githooks', guard))).toBe(true);
			expect(staged).toContain(`.githooks/${guard}`);
		}
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

	test('installs the commit-time leak guard alongside the push guard', async () => {
		// A project is unguarded at commit time from creation until the next fleet-wide sync
		// otherwise, which is exactly the window in which it accumulates its first secrets.
		const dir = await makeRepo('commit-guard');
		expect(await ensureHistoryGuard(dir, AIDD_ROOT)).toBe('installed');

		const hook = join(dir, '.githooks', 'pre-commit');
		expect(existsSync(hook)).toBe(true);
		expect(existsSync(join(dir, '.githooks', 'leak-guard.sh'))).toBe(true);

		// The guard-only variant, not aidd's own pre-commit: a scaffolded package.json does not define
		// check:licenses, and a hook that calls a task the project does not define fails every commit
		// rather than guarding one.
		// Matched against executable lines only: the file's header explains the script-name contract
		// at length, so a substring search over the whole body finds those names in prose.
		const body = readFileSync(hook, 'utf8');
		expect(body).toContain('bash .githooks/leak-guard.sh');
		expect(body).not.toMatch(/^\s*bun run /m);

		const staged = git(dir, ['diff', '--cached', '--name-only']).split('\n');
		expect(staged).toContain('.githooks/pre-commit');
		expect(staged).toContain('.githooks/leak-guard.sh');
		expect(git(dir, ['ls-files', '-s', '.githooks/pre-commit']).split(/\s+/)[0]).toBe('100755');
	});

	test('keeps an existing pre-commit that already carries the marker — it may be the richer variant', async () => {
		// The 2026-08-09 downgrade. What ships from the scaffold is deliberately the LESSER of two
		// pre-commit variants, and the marker it is guarded by (`bash .githooks/leak-guard.sh`) is a
		// line both variants carry — so the foreign-hook test passes on the full hook and the copy
		// proceeds. Every aidd run then replaced the richer hook with the poorer one and staged the
		// result, in this repository among 31 others. A hook that already exists is never overwritten.
		const dir = await makeRepo('richer-commit');
		await mkdir(join(dir, '.githooks'), { recursive: true });
		const mine = '#!/usr/bin/env bash\nbash .githooks/leak-guard.sh\nbun run check:licenses\n';
		await writeFile(join(dir, '.githooks', 'pre-commit'), mine);

		expect(await ensureHistoryGuard(dir, AIDD_ROOT)).toBe('installed');
		expect(readFileSync(join(dir, '.githooks', 'pre-commit'), 'utf8')).toBe(mine);

		const staged = git(dir, ['diff', '--cached', '--name-only']).split('\n');
		expect(staged).not.toContain('.githooks/pre-commit');
		// The guard the kept hook chains is still delivered: keeping the hook must not leave it
		// sourcing a script that is not there, which under `set -euo pipefail` fails every commit.
		expect(existsSync(join(dir, '.githooks', 'leak-guard.sh'))).toBe(true);
		expect(staged).toContain('.githooks/leak-guard.sh');
	});

	test('refuses to clobber a foreign pre-commit, and says which hook it refused', async () => {
		// The push guard still installs: it is the stronger obligation of the two, and a project
		// that can only have one should get the one that keeps `.aidd/` history off a remote.
		const dir = await makeRepo('foreign-commit');
		await mkdir(join(dir, '.githooks'), { recursive: true });
		await writeFile(join(dir, '.githooks', 'pre-commit'), '#!/usr/bin/env bash\necho mine\n');

		expect(await ensureHistoryGuard(dir, AIDD_ROOT)).toBe('foreign-commit-hook');
		expect(await Bun.file(join(dir, '.githooks', 'pre-commit')).text()).toContain('echo mine');
		expect(indexMode(dir)).toBe('100755');
	});
});
