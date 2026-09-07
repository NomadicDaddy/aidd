import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { resolveBashExecutable } from '../../shared/src/agent/tools/bash-runtime.ts';
import { testTempDirSync } from '../_helpers/temp.ts';

// Every case below is a way this guard could silently PASS when it should block. A guard whose
// failure paths are never executed is indistinguishable from one that has stopped detecting
// anything — and this one is the only thing standing between a `git push` and permanent .aidd
// exposure, so its branches are exercised against real repositories rather than mocks.
const GUARD = resolve(import.meta.dir, '..', '..', '.githooks', 'aidd-history-guard.sh');
const ZERO = '0'.repeat(40);
const tmpRoot = testTempDirSync('history-guard');

// Throws on non-zero. A helper that swallows git failures made a broken fixture (`push origin
// main` against a `master` default branch) look exactly like a guard that blocks a clean push.
const git = async (cwd: string, args: string[]): Promise<string> => {
	const p = Bun.spawn(['git', ...args], {
		cwd,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	const [out, err, code] = await Promise.all([
		new Response(p.stdout).text(),
		new Response(p.stderr).text(),
		p.exited,
	]);
	if (code !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${err.trim()}`);
	return out.trim();
};

// Never spawn a bare `bash`: on Windows the first PATH match is often the System32 WSL shim, which
// cannot run a Windows-path script — so these tests would fail (or pass) purely on PATH ordering
// rather than on the guard's behaviour. aidd already resolves this deterministically for the agent's
// shell tool; reuse it rather than re-learn it.
const bashResolution = resolveBashExecutable();
const BASH = 'path' in bashResolution ? bashResolution.path : null;

/** Runs the guard with a pre-push stdin line; returns exit code + stderr. */
const runGuard = async (
	cwd: string,
	stdin: string,
	remote = 'origin',
): Promise<{ code: number; err: string }> => {
	if (BASH === null) throw new Error(`no usable bash: ${JSON.stringify(bashResolution)}`);
	const p = Bun.spawn([BASH, GUARD, remote], {
		cwd,
		stdin: new TextEncoder().encode(stdin),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	const err = await new Response(p.stderr).text();
	return { code: await p.exited, err };
};

let seq = 0;
/** A repo with a real file-path "remote" so fetch/rev-list behave as they do in anger. */
const makeRepoPair = async (name: string): Promise<{ repo: string; remote: string }> => {
	const base = join(tmpRoot, `${name}-${seq++}`);
	const remote = join(base, 'remote.git');
	const repo = join(base, 'work');
	await mkdir(remote, { recursive: true });
	// -b main explicitly: the default branch name is machine config, and every test below pushes
	// `main` by name.
	await git(remote, ['init', '--bare', '-q', '-b', 'main', '.']);
	await mkdir(repo, { recursive: true });
	await git(repo, ['init', '-q', '-b', 'main', '.']);
	await git(repo, ['config', 'user.email', 'guard@test.invalid']);
	await git(repo, ['config', 'user.name', 'Guard Test']);
	await git(repo, ['remote', 'add', 'origin', remote]);
	await writeFile(join(repo, '.gitignore'), '/.aidd/\n');
	await writeFile(join(repo, 'src.txt'), 'code\n');
	await git(repo, ['add', '-A']);
	await git(repo, ['commit', '-qm', 'init']);
	return { remote, repo };
};

/** Commits a .aidd file, bypassing the ignore rule the way a mis-set-up repo would. */
const commitAidd = async (repo: string, msg: string): Promise<void> => {
	await mkdir(join(repo, '.aidd'), { recursive: true });
	await writeFile(join(repo, '.aidd', 'spec.md'), `# ${msg}\n`);
	await git(repo, ['add', '-f', '.aidd/spec.md']);
	await git(repo, ['commit', '-qm', msg]);
};

const head = (repo: string) => git(repo, ['rev-parse', 'HEAD']);

describe('hook file modes', () => {
	// core.fileMode=false (Windows) means git ignores the on-disk exec bit, so a hook copied on
	// Windows records as 100644 — and git refuses to execute a non-executable hook on POSIX. A
	// clone to Linux/macOS would get a silently disabled guard, which is worse than none: the repo
	// looks protected. Only the INDEX mode survives a clone, so that is what is asserted.
	const repoRoot = resolve(import.meta.dir, '..', '..');

	const indexMode = async (path: string): Promise<string> =>
		(await git(repoRoot, ['ls-files', '-s', path])).split(/\s+/)[0] ?? '';

	test('hooks git invokes directly are executable in the index', async () => {
		expect(await indexMode('.githooks/pre-push')).toBe('100755');
		expect(await indexMode('.githooks/pre-commit')).toBe('100755');
	});

	test('bodies invoked via `bash <path>` need no exec bit', async () => {
		// Matches the leak-guard convention; asserted so nobody "fixes" them into inconsistency.
		expect(await indexMode('.githooks/aidd-history-guard.sh')).toBe('100644');
		expect(await indexMode('.githooks/leak-guard.sh')).toBe('100644');
	});
});

describe('aidd history guard', () => {
	test('managed repo (no push remote) is not guarded at all', async () => {
		const { repo } = await makeRepoPair('managed');
		await git(repo, ['remote', 'remove', 'origin']);
		await commitAidd(repo, 'feat: tracked blueprint');
		const r = await runGuard(
			repo,
			`refs/heads/main ${await head(repo)} refs/heads/main ${ZERO}\n`,
		);
		expect(r.code).toBe(0);
	});

	test('a dormant guard ARMS ITSELF when a managed repo later gains a remote', async () => {
		// This is the whole reason the guard is installed into managed repos too. An app in this
		// fleet was managed, quietly gained a push remote, and accumulated 72 tracked files and 170
		// before anyone noticed. Installing only where a remote exists today guards the repos that
		// are already safe and misses the transition entirely.
		const { remote, repo } = await makeRepoPair('arms-itself');
		await git(repo, ['remote', 'remove', 'origin']);
		await commitAidd(repo, 'feat: tracked blueprint');
		// Managed: no remote, .aidd tracked on purpose. Guard must be inert.
		const before = await runGuard(
			repo,
			`refs/heads/main ${await head(repo)} refs/heads/main ${ZERO}\n`,
		);
		expect(before.code).toBe(0);

		// Someone adds a remote. Nothing else changes; nobody re-runs the installer.
		await git(repo, ['remote', 'add', 'origin', remote]);
		const after = await runGuard(
			repo,
			`refs/heads/main ${await head(repo)} refs/heads/main ${ZERO}\n`,
		);
		expect(after.code).toBe(1);
		expect(after.err).toContain('tracked .aidd path');
	});

	test('branch deletion is skipped, not treated as a revision', async () => {
		const { repo } = await makeRepoPair('deletion');
		await git(repo, ['push', '-q', 'origin', 'main']);
		// local_sha all-zeros = delete. Must not crash and must not block.
		const r = await runGuard(repo, `(delete) ${ZERO} refs/heads/main ${await head(repo)}\n`);
		expect(r.code).toBe(0);
	});

	test('existing branch with a clean range passes', async () => {
		const { repo } = await makeRepoPair('clean-range');
		await git(repo, ['push', '-q', 'origin', 'main']);
		const base = await head(repo);
		await writeFile(join(repo, 'src.txt'), 'more code\n');
		await git(repo, ['commit', '-qam', 'feat: source only']);
		const r = await runGuard(
			repo,
			`refs/heads/main ${await head(repo)} refs/heads/main ${base}\n`,
		);
		expect(r.code).toBe(0);
	});

	test('existing branch with .aidd in the range blocks — tip clean, history dirty', async () => {
		const { repo } = await makeRepoPair('tip-clean-history-dirty');
		await git(repo, ['push', '-q', 'origin', 'main']);
		const base = await head(repo);
		await commitAidd(repo, 'feat: adds blueprint');
		// Untrack it, exactly as the remediation does. The TIP IS NOW CLEAN...
		await git(repo, ['rm', '--cached', '-rq', '.aidd']);
		await git(repo, ['commit', '-qm', 'chore: untrack .aidd']);
		expect(await git(repo, ['ls-files', '.aidd'])).toBe('');
		// ...but history still carries it, and a push publishes history.
		const r = await runGuard(
			repo,
			`refs/heads/main ${await head(repo)} refs/heads/main ${base}\n`,
		);
		expect(r.code).toBe(1);
		expect(r.err).toContain('touch .aidd');
	});

	test('tracked .aidd blocks even with no history in range', async () => {
		const { repo } = await makeRepoPair('tracked');
		await commitAidd(repo, 'feat: blueprint');
		await git(repo, ['push', '-q', 'origin', 'main']);
		const r = await runGuard(
			repo,
			`refs/heads/main ${await head(repo)} refs/heads/main ${await head(repo)}\n`,
		);
		expect(r.code).toBe(1);
		expect(r.err).toContain('tracked .aidd path');
	});

	test('missing /.aidd/ ignore rule blocks', async () => {
		const { repo } = await makeRepoPair('no-rule');
		await writeFile(join(repo, '.gitignore'), 'node_modules/\n');
		await git(repo, ['commit', '-qam', 'chore: drop the rule']);
		await git(repo, ['push', '-q', 'origin', 'main']);
		const r = await runGuard(
			repo,
			`refs/heads/main ${await head(repo)} refs/heads/main ${await head(repo)}\n`,
		);
		expect(r.code).toBe(1);
		expect(r.err).toContain('no ignore rule covers .aidd/');
	});

	test('new branch with no .aidd anywhere passes', async () => {
		const { repo } = await makeRepoPair('new-clean');
		await git(repo, ['push', '-q', 'origin', 'main']);
		await git(repo, ['checkout', '-qb', 'feature']);
		await writeFile(join(repo, 'src.txt'), 'feature code\n');
		await git(repo, ['commit', '-qam', 'feat: work']);
		const r = await runGuard(
			repo,
			`refs/heads/feature ${await head(repo)} refs/heads/feature ${ZERO}\n`,
		);
		expect(r.code).toBe(0);
	});

	test('new branch with UNPUBLISHED .aidd history blocks', async () => {
		const { repo } = await makeRepoPair('new-dirty');
		await git(repo, ['push', '-q', 'origin', 'main']);
		await git(repo, ['checkout', '-qb', 'feature']);
		await commitAidd(repo, 'feat: adds blueprint');
		await git(repo, ['rm', '--cached', '-rq', '.aidd']);
		await git(repo, ['commit', '-qm', 'chore: untrack']);
		const r = await runGuard(
			repo,
			`refs/heads/feature ${await head(repo)} refs/heads/feature ${ZERO}\n`,
		);
		expect(r.code).toBe(1);
	});

	test('new branch whose .aidd history is ALREADY PUBLISHED passes — the already-published case', async () => {
		// The strict form (rev-list local_sha -- .aidd) blocks this forever over commits the push
		// cannot expose twice. Fetching first is what makes the exclusion trustworthy.
		const { repo } = await makeRepoPair('already-public');
		await commitAidd(repo, 'feat: blueprint (this gets published)');
		await git(repo, ['rm', '--cached', '-rq', '.aidd']);
		await git(repo, ['commit', '-qm', 'chore: untrack']);
		await git(repo, ['push', '-q', 'origin', 'main']);
		await git(repo, ['checkout', '-qb', 'feature']);
		await writeFile(join(repo, 'src.txt'), 'clean work\n');
		await git(repo, ['commit', '-qam', 'feat: source only']);
		const r = await runGuard(
			repo,
			`refs/heads/feature ${await head(repo)} refs/heads/feature ${ZERO}\n`,
		);
		expect(r.code).toBe(0);
	});

	test('new branch + unreachable remote fails CLOSED, never open', async () => {
		const { repo } = await makeRepoPair('offline');
		await commitAidd(repo, 'feat: blueprint');
		await git(repo, ['rm', '--cached', '-rq', '.aidd']);
		await git(repo, ['commit', '-qm', 'chore: untrack']);
		await git(repo, ['remote', 'set-url', 'origin', join(tmpRoot, 'does-not-exist.git')]);
		const r = await runGuard(
			repo,
			`refs/heads/main ${await head(repo)} refs/heads/main ${ZERO}\n`,
		);
		expect(r.code).toBe(1);
	});

	test('multiple ref updates: one clean ref does not exonerate a dirty one', async () => {
		const { repo } = await makeRepoPair('multi-ref');
		await git(repo, ['push', '-q', 'origin', 'main']);
		const base = await head(repo);
		await writeFile(join(repo, 'src.txt'), 'clean\n');
		await git(repo, ['commit', '-qam', 'feat: clean']);
		const cleanSha = await head(repo);
		await git(repo, ['checkout', '-qb', 'dirty']);
		await commitAidd(repo, 'feat: dirty blueprint');
		const dirtySha = await head(repo);
		await git(repo, ['rm', '--cached', '-rq', '.aidd']);
		await git(repo, ['commit', '-qm', 'chore: untrack']);
		const r = await runGuard(
			repo,
			`refs/heads/main ${cleanSha} refs/heads/main ${base}\n` +
				`refs/heads/dirty ${dirtySha} refs/heads/dirty ${base}\n`,
		);
		expect(r.code).toBe(1);
	});

	test('a rev-list FAILURE fails closed — an unreachable remote sha is not "no commits"', async () => {
		// `git rev-list <bogus>..HEAD` exits 128 and prints nothing. Swallowing that with `|| true`
		// reads identically to a clean range, so a shallow or truncated clone would publish .aidd
		// history unchecked. The query's exit status must be honoured, not just its output.
		const { repo } = await makeRepoPair('rev-list-fail');
		await commitAidd(repo, 'feat: blueprint');
		await git(repo, ['rm', '--cached', '-rq', '.aidd']);
		await git(repo, ['commit', '-qm', 'chore: untrack']);
		const bogus = 'deadbeef'.repeat(5);
		const r = await runGuard(
			repo,
			`refs/heads/main ${await head(repo)} refs/heads/main ${bogus}\n`,
		);
		expect(r.code).toBe(1);
		expect(r.err).toContain('a failed query is not an empty result');
	});

	test('force push with a diverged history is still inspected', async () => {
		const { repo } = await makeRepoPair('force');
		await git(repo, ['push', '-q', 'origin', 'main']);
		const base = await head(repo);
		await commitAidd(repo, 'feat: blueprint');
		await git(repo, ['rm', '--cached', '-rq', '.aidd']);
		await git(repo, ['commit', '-qm', 'chore: untrack']);
		// remote_sha is the OLD tip; the range still exposes the .aidd commit.
		const r = await runGuard(
			repo,
			`refs/heads/main ${await head(repo)} refs/heads/main ${base}\n`,
		);
		expect(r.code).toBe(1);
	});
});
