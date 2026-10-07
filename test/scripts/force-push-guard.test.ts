import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { resolveBashExecutable } from '../../shared/src/agent/tools/bash-runtime.ts';
import { AGENT_MARKER_ENV } from '../../shared/src/subprocess-env.ts';
import { testTempDirSync } from '../_helpers/temp.ts';

// The guard is the only control between an external CLI running with permission bypass and a
// rewritten shared remote: aidd's bash deny-list never sees that CLI's shell, and the prompt's
// prohibition is advice. Every branch below is therefore driven against real repositories and,
// at the end, through a real `git push` with the whole pre-push chain installed, because a guard
// whose refusal path is never executed cannot be told from one that has stopped refusing.
const HOOKS_DIR = resolve(import.meta.dir, '..', '..', '.githooks');
const GUARD = join(HOOKS_DIR, 'force-push-guard.sh');
const ZERO = '0'.repeat(40);
const tmpRoot = testTempDirSync('force-push-guard');

const bashResolution = resolveBashExecutable();
const BASH = 'path' in bashResolution ? bashResolution.path : null;

interface Spawned {
	code: number;
	err: string;
}

async function git(cwd: string, args: string[], env?: Record<string, string>): Promise<string> {
	const p = Bun.spawn(['git', ...args], {
		cwd,
		...(env ? { env } : {}),
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
}

async function gitResult(
	cwd: string,
	args: string[],
	env: Record<string, string>,
): Promise<Spawned> {
	const p = Bun.spawn(['git', ...args], {
		cwd,
		env,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	const err = await new Response(p.stderr).text();
	return { code: await p.exited, err };
}

/** The operator's environment, and the same environment as an agent process carries it. */
const operatorEnv = (): Record<string, string> => {
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (value !== undefined && key !== AGENT_MARKER_ENV) env[key] = value;
	}
	return env;
};
const agentEnv = (): Record<string, string> => ({ ...operatorEnv(), [AGENT_MARKER_ENV]: '1' });

/** Runs the guard body with pre-push stdin lines under the given environment. */
async function runGuard(cwd: string, stdin: string, env: Record<string, string>): Promise<Spawned> {
	if (BASH === null) throw new Error(`no usable bash: ${JSON.stringify(bashResolution)}`);
	const p = Bun.spawn([BASH, GUARD], {
		cwd,
		env,
		stdin: new TextEncoder().encode(stdin),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	const err = await new Response(p.stderr).text();
	return { code: await p.exited, err };
}

let seq = 0;
/**
 * A repository whose `main` is published to a bare remote as two commits, with one unpublished
 * commit on top. Two published commits, so a test can rewrite the published tip (reset to its
 * parent and commit something else) and still have a parent to reset to.
 */
async function makeRepoPair(name: string): Promise<{ remote: string; repo: string }> {
	const base = join(tmpRoot, `${name}-${seq++}`);
	const remote = join(base, 'remote.git');
	const repo = join(base, 'work');
	await mkdir(remote, { recursive: true });
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
	await writeFile(join(repo, 'src.txt'), 'more code\n');
	await git(repo, ['commit', '-qam', 'second']);
	await git(repo, ['push', '-q', 'origin', 'main']);
	await writeFile(join(repo, 'src.txt'), 'even more code\n');
	await git(repo, ['commit', '-qam', 'third']);
	return { remote, repo };
}

const line = (localSha: string, remoteSha: string, ref = 'refs/heads/main'): string =>
	`${ref} ${localSha} ${ref} ${remoteSha}\n`;

describe('force-push guard body', () => {
	test('outside an agent process the guard is inert, even for a rewrite', async () => {
		const { repo } = await makeRepoPair('inert');
		const published = await git(repo, ['rev-parse', 'origin/main']);
		await git(repo, ['commit', '-q', '--amend', '-m', 'rewritten']);
		const head = await git(repo, ['rev-parse', 'HEAD']);
		await git(repo, ['reset', '-q', '--hard', published]);
		const result = await runGuard(repo, line(head, published), operatorEnv());
		expect(result).toEqual({ code: 0, err: '' });
	});

	test('a fast-forward push passes', async () => {
		const { repo } = await makeRepoPair('ff');
		const published = await git(repo, ['rev-parse', 'origin/main']);
		const head = await git(repo, ['rev-parse', 'HEAD']);
		expect(await runGuard(repo, line(head, published), agentEnv())).toEqual({
			code: 0,
			err: '',
		});
	});

	test('creating a ref passes: nothing exists to rewrite', async () => {
		const { repo } = await makeRepoPair('new-ref');
		const head = await git(repo, ['rev-parse', 'HEAD']);
		expect(await runGuard(repo, line(head, ZERO, 'refs/heads/feature'), agentEnv())).toEqual({
			code: 0,
			err: '',
		});
	});

	test('deleting a remote ref is refused', async () => {
		const { repo } = await makeRepoPair('delete');
		const published = await git(repo, ['rev-parse', 'origin/main']);
		const result = await runGuard(repo, line(ZERO, published), agentEnv());
		expect(result.code).toBe(1);
		expect(result.err).toContain('refs/heads/main: this push deletes the remote ref');
		expect(result.err).toContain('PUSH BLOCKED');
	});

	test('a diverged history is refused and the refusal names the ref', async () => {
		const { repo } = await makeRepoPair('diverged');
		const published = await git(repo, ['rev-parse', 'origin/main']);
		// Rewrite the published commit itself, so the remote tip is no ancestor of the new tip.
		await git(repo, ['reset', '-q', '--hard', `${published}~1`]);
		await writeFile(join(repo, 'src.txt'), 'rewritten\n');
		await git(repo, ['commit', '-qam', 'rewritten']);
		const head = await git(repo, ['rev-parse', 'HEAD']);
		const result = await runGuard(repo, line(head, published), agentEnv());
		expect(result.code).toBe(1);
		expect(result.err).toContain('refs/heads/main: the remote tip');
		expect(result.err).toContain('non-fast-forward');
		expect(result.err).toContain('issued by an aidd agent');
	});

	test('moving an annotated tag is a rewrite too: tag objects are peeled, not misread', async () => {
		const { repo } = await makeRepoPair('tag');
		await git(repo, ['tag', '-a', 'v1', '-m', 'v1', 'HEAD~1']);
		await git(repo, ['tag', '-a', 'v1-moved', '-m', 'v1 moved', 'HEAD']);
		const oldTag = await git(repo, ['rev-parse', 'v1']);
		const movedForward = await git(repo, ['rev-parse', 'v1-moved']);
		// Forward along the same history is an ancestor relation and passes; the reverse is not.
		expect(
			await runGuard(repo, line(movedForward, oldTag, 'refs/tags/v1'), agentEnv()),
		).toEqual({ code: 0, err: '' });
		const back = await runGuard(repo, line(oldTag, movedForward, 'refs/tags/v1'), agentEnv());
		expect(back.code).toBe(1);
		expect(back.err).toContain('refs/tags/v1');
	});

	test('a remote tip this repository cannot resolve fails closed', async () => {
		const { repo } = await makeRepoPair('unknown-tip');
		const head = await git(repo, ['rev-parse', 'HEAD']);
		const result = await runGuard(repo, line(head, 'f'.repeat(40)), agentEnv());
		expect(result.code).toBe(1);
		expect(result.err).toContain('non-fast-forward');
	});

	test('one rewriting ref blocks the push whatever the other refs do', async () => {
		const { repo } = await makeRepoPair('mixed');
		const published = await git(repo, ['rev-parse', 'origin/main']);
		const head = await git(repo, ['rev-parse', 'HEAD']);
		const stdin =
			line(head, published) + line(head, ZERO, 'refs/heads/feature') + line(ZERO, published);
		const result = await runGuard(repo, stdin, agentEnv());
		expect(result.code).toBe(1);
		expect(result.err).toContain('deletes the remote ref');
	});
});

describe('force-push guard through git push', () => {
	// The chain git actually runs: aidd's own pre-push wrapper and every guard it sources, pointed
	// at by core.hooksPath exactly as ensureHistoryGuard configures it. Installed after the
	// fixture's commits are made, because the same directory holds aidd's pre-commit, whose gate
	// commands have no meaning in a fixture repository.
	const install = async (repo: string): Promise<void> => {
		await git(repo, ['config', 'core.hooksPath', HOOKS_DIR.split('\\').join('/')]);
	};

	test('an agent process cannot force-push, whichever spelling it uses', async () => {
		const { repo } = await makeRepoPair('e2e-force');
		const published = await git(repo, ['rev-parse', 'origin/main']);
		await git(repo, ['reset', '-q', '--hard', `${published}~1`]);
		await writeFile(join(repo, 'src.txt'), 'rewritten\n');
		await git(repo, ['commit', '-qam', 'rewritten']);
		await install(repo);

		for (const args of [
			['push', '--force', 'origin', 'main'],
			['push', '--force-with-lease', 'origin', 'main'],
			['push', 'origin', '+main'],
		]) {
			const result = await gitResult(repo, args, agentEnv());
			expect(result.code).not.toBe(0);
			expect(result.err).toContain('PUSH BLOCKED');
		}
		// The remote is exactly where it was.
		expect(await git(repo, ['ls-remote', '--heads', 'origin', 'main'])).toContain(published);
	});

	test('an agent process still makes an ordinary fast-forward push', async () => {
		const { repo } = await makeRepoPair('e2e-ff');
		await install(repo);
		const head = await git(repo, ['rev-parse', 'HEAD']);
		const result = await gitResult(repo, ['push', 'origin', 'main'], agentEnv());
		expect(result.err).not.toContain('PUSH BLOCKED');
		expect(result.code).toBe(0);
		expect(await git(repo, ['ls-remote', '--heads', 'origin', 'main'])).toContain(head);
	});

	test('the operator force-pushes from their own shell unhindered', async () => {
		const { repo } = await makeRepoPair('e2e-operator');
		const published = await git(repo, ['rev-parse', 'origin/main']);
		await git(repo, ['reset', '-q', '--hard', `${published}~1`]);
		await writeFile(join(repo, 'src.txt'), 'rewritten\n');
		await git(repo, ['commit', '-qam', 'rewritten']);
		await install(repo);
		const head = await git(repo, ['rev-parse', 'HEAD']);
		const result = await gitResult(repo, ['push', '--force', 'origin', 'main'], operatorEnv());
		expect(result.err).not.toContain('PUSH BLOCKED');
		expect(result.code).toBe(0);
		expect(await git(repo, ['ls-remote', '--heads', 'origin', 'main'])).toContain(head);
	});
});
