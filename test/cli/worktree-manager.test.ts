import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import {
	createRunWorktree,
	mergeRunBack,
	recordIterationCheckpoint,
	removeRunWorktree,
} from '../../cli/src/orchestrator/run/worktree-manager.ts';
import { finalizeRunWorktree } from '../../cli/src/orchestrator/run/worktree-evidence.ts';
import type { WorktreeMetadataSession } from '../../cli/src/orchestrator/run/worktree-metadata-session.ts';
import { orchestratorExitCodes } from '../../shared/src/orchestrator/result.ts';
import { removeTempTree } from '../backend/_helpers/remove-temp-tree.ts';

import { testTempDir } from '../_helpers/temp.ts';
async function runGit(cwd: string, args: string[]): Promise<string> {
	const proc = Bun.spawn(['git', '-C', cwd, ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (exitCode !== 0) throw new Error(`git ${args.join(' ')} failed: ${stderr || stdout}`);
	return stdout.trim();
}

async function initRepoWithCommit(projectDir: string): Promise<void> {
	await mkdir(projectDir, { recursive: true });
	await runGit(projectDir, ['init', '-b', 'main']);
	// Identity via a direct .git/config append instead of two `git config` spawns; git
	// process startup dominates this fixture's cost. Safe only because `.git` here is
	// always a fresh directory `git init` just created.
	await appendFile(
		join(projectDir, '.git', 'config'),
		'[user]\n\temail = test@aidd.local\n\tname = aidd test\n',
	);
	await writeFile(join(projectDir, 'file.txt'), 'base\n');
	await runGit(projectDir, ['add', '.']);
	await runGit(projectDir, ['commit', '-m', 'base']);
}

// Commit a change inside the worktree as if an execution stage had run there. No identity
// setup: worktrees share the parent repository's config, which initRepoWithCommit wrote.
async function commitInWorktree(dir: string, name: string, contents: string): Promise<void> {
	await writeFile(join(dir, name), contents);
	await runGit(dir, ['add', '.']);
	await runGit(dir, ['commit', '-m', `add ${name}`]);
}

describe('worktree-manager', () => {
	test('returns null when the project has no committed HEAD', async () => {
		const root = await testTempDir('aidd-wt-test-');
		try {
			const bare = join(root, 'no-commits');
			await mkdir(bare, { recursive: true });
			await runGit(bare, ['init', '-b', 'main']);
			expect(await createRunWorktree(bare, 'run1', { baseDir: join(root, 'wt') })).toBeNull();

			const notGit = join(root, 'not-git');
			await mkdir(notGit, { recursive: true });
			expect(
				await createRunWorktree(notGit, 'run2', { baseDir: join(root, 'wt') }),
			).toBeNull();
		} finally {
			await removeTempTree(root);
		}
	});

	test('creates an isolated worktree branched off HEAD', async () => {
		const root = await testTempDir('aidd-wt-test-');
		try {
			const projectDir = join(root, 'project');
			await initRepoWithCommit(projectDir);
			const baseSha = await runGit(projectDir, ['rev-parse', 'HEAD']);

			const wt = await createRunWorktree(projectDir, 'run1', { baseDir: join(root, 'wt') });
			expect(wt).not.toBeNull();
			expect(wt!.branch).toBe('aidd/run-run1');
			expect(wt!.baseSha).toBe(baseSha);
			expect(existsSync(join(wt!.dir, 'file.txt'))).toBe(true);
			// The worktree is a separate path, not under the project tree.
			expect(wt!.dir.startsWith(projectDir)).toBe(false);

			await removeRunWorktree(projectDir, wt!);
		} finally {
			await removeTempTree(root);
		}
	});

	test('fast-forward merges a worktree commit back into the project, then tears down', async () => {
		const root = await testTempDir('aidd-wt-test-');
		try {
			const projectDir = join(root, 'project');
			await initRepoWithCommit(projectDir);
			const wt = (await createRunWorktree(projectDir, 'run1', {
				baseDir: join(root, 'wt'),
			}))!;

			await commitInWorktree(wt.dir, 'new.txt', 'from worktree\n');
			const merge = await mergeRunBack(projectDir, wt);

			expect(merge.status).toBe('merged');
			expect(existsSync(join(projectDir, 'new.txt'))).toBe(true);

			await removeRunWorktree(projectDir, wt);
			expect(existsSync(wt.dir)).toBe(false);
			// Branch is gone.
			expect(await runGit(projectDir, ['branch', '--list', wt.branch])).toBe('');
		} finally {
			await removeTempTree(root);
		}
	});

	test('reports noop when the worktree never advanced', async () => {
		const root = await testTempDir('aidd-wt-test-');
		try {
			const projectDir = join(root, 'project');
			await initRepoWithCommit(projectDir);
			const wt = (await createRunWorktree(projectDir, 'run1', {
				baseDir: join(root, 'wt'),
			}))!;

			expect((await mergeRunBack(projectDir, wt)).status).toBe('noop');
			await removeRunWorktree(projectDir, wt);
		} finally {
			await removeTempTree(root);
		}
	});

	test('blocks merge-back when the live project tree is dirty', async () => {
		const root = await testTempDir('aidd-wt-test-');
		try {
			const projectDir = join(root, 'project');
			await initRepoWithCommit(projectDir);
			const wt = (await createRunWorktree(projectDir, 'run1', {
				baseDir: join(root, 'wt'),
			}))!;
			await commitInWorktree(wt.dir, 'new.txt', 'from worktree\n');

			// Operator edit in the live tree — merge-back must not clobber it.
			await writeFile(join(projectDir, 'file.txt'), 'dirty edit\n');
			expect((await mergeRunBack(projectDir, wt)).status).toBe('blocked');
			expect(existsSync(join(projectDir, 'new.txt'))).toBe(false);

			await removeRunWorktree(projectDir, wt);
		} finally {
			await removeTempTree(root);
		}
	});

	test('records per-iteration checkpoints and prunes them on teardown', async () => {
		const root = await testTempDir('aidd-wt-test-');
		try {
			const projectDir = join(root, 'project');
			await initRepoWithCommit(projectDir);
			const wt = (await createRunWorktree(projectDir, 'run1', {
				baseDir: join(root, 'wt'),
			}))!;
			await commitInWorktree(wt.dir, 'a.txt', 'one\n');
			await recordIterationCheckpoint(wt, 0);
			await commitInWorktree(wt.dir, 'b.txt', 'two\n');
			await recordIterationCheckpoint(wt, 1);

			const refs = await runGit(projectDir, [
				'for-each-ref',
				'--format=%(refname)',
				'refs/aidd-checkpoints/run1',
			]);
			expect(refs).toContain('refs/aidd-checkpoints/run1/iter-0');
			expect(refs).toContain('refs/aidd-checkpoints/run1/iter-1');

			await removeRunWorktree(projectDir, wt);
			// Teardown prunes the checkpoint namespace (so a rolled-back run keeps nothing alive).
			expect(
				await runGit(projectDir, [
					'for-each-ref',
					'--format=%(refname)',
					'refs/aidd-checkpoints/run1',
				]),
			).toBe('');
		} finally {
			await removeTempTree(root);
		}
	});

	test('blocks merge-back when the live tree has an untracked file', async () => {
		const root = await testTempDir('aidd-wt-test-');
		try {
			const projectDir = join(root, 'project');
			await initRepoWithCommit(projectDir);
			const wt = (await createRunWorktree(projectDir, 'run1', {
				baseDir: join(root, 'wt'),
			}))!;
			await commitInWorktree(wt.dir, 'new.txt', 'from worktree\n');

			// An untracked operator file must count as a dirty live tree and block the merge.
			await writeFile(join(projectDir, 'untracked.txt'), 'operator scratch\n');
			expect((await mergeRunBack(projectDir, wt)).status).toBe('blocked');
			expect(existsSync(join(projectDir, 'new.txt'))).toBe(false);

			await removeRunWorktree(projectDir, wt);
		} finally {
			await removeTempTree(root);
		}
	});

	// Finalization-flow coverage here sticks to merge/park/discard outcomes with an empty
	// metadata session; seeding, evidence persistence, and metadata write-back live in
	// worktree-metadata-session.test.ts.
	const emptySession = (): WorktreeMetadataSession => ({ baseline: new Map(), seededFiles: 0 });

	test('finalizeRunWorktree: clean success merges, removes the worktree, returns no override', async () => {
		const root = await testTempDir('aidd-wt-test-');
		try {
			const projectDir = join(root, 'project');
			await initRepoWithCommit(projectDir);
			const wt = (await createRunWorktree(projectDir, 'run1', {
				baseDir: join(root, 'wt'),
			}))!;
			await commitInWorktree(wt.dir, 'new.txt', 'from worktree\n');

			const finalization = await finalizeRunWorktree({
				exitCode: orchestratorExitCodes.success,
				projectDir,
				session: emptySession(),
				worktree: wt,
			});
			expect(finalization.overrideExitCode).toBeUndefined();
			expect(finalization.mergeStatus).toBe('merged');
			expect(existsSync(join(projectDir, 'new.txt'))).toBe(true);
			expect(existsSync(wt.dir)).toBe(false);
		} finally {
			await removeTempTree(root);
		}
	});

	test('finalizeRunWorktree: a parked merge returns exit 77 and preserves the worktree', async () => {
		const root = await testTempDir('aidd-wt-test-');
		try {
			const projectDir = join(root, 'project');
			await initRepoWithCommit(projectDir);
			const wt = (await createRunWorktree(projectDir, 'run1', {
				baseDir: join(root, 'wt'),
			}))!;
			await commitInWorktree(wt.dir, 'new.txt', 'from worktree\n');
			// Dirty live tree → merge blocked even though the run itself succeeded.
			await writeFile(join(projectDir, 'file.txt'), 'operator edit\n');

			const finalization = await finalizeRunWorktree({
				exitCode: orchestratorExitCodes.success,
				projectDir,
				session: emptySession(),
				worktree: wt,
			});
			expect(finalization.overrideExitCode).toBe(orchestratorExitCodes.mergeConflictParked);
			expect(finalization.mergeStatus).toBe('blocked');
			expect(existsSync(wt.dir)).toBe(true); // preserved for manual resolution
			expect(await runGit(projectDir, ['branch', '--list', wt.branch])).toContain(wt.branch);

			await removeRunWorktree(projectDir, wt);
		} finally {
			await removeTempTree(root);
		}
	});

	test('finalizeRunWorktree: a failed run discards the worktree and returns no override', async () => {
		const root = await testTempDir('aidd-wt-test-');
		try {
			const projectDir = join(root, 'project');
			await initRepoWithCommit(projectDir);
			const wt = (await createRunWorktree(projectDir, 'run1', {
				baseDir: join(root, 'wt'),
			}))!;
			await commitInWorktree(wt.dir, 'new.txt', 'from worktree\n');

			const finalization = await finalizeRunWorktree({
				exitCode: orchestratorExitCodes.generalError,
				projectDir,
				session: emptySession(),
				worktree: wt,
			});
			expect(finalization.overrideExitCode).toBeUndefined();
			expect(finalization.mergeStatus).toBe('discarded');
			expect(existsSync(wt.dir)).toBe(false); // discarded (rollback)
			expect(existsSync(join(projectDir, 'new.txt'))).toBe(false); // never merged
		} finally {
			await removeTempTree(root);
		}
	});

	// The flailing guard fires on the run's LAST iterations; earlier ones may have landed real
	// commits. Those must survive, exactly as they did when a flailing stop reported exit 0 — the
	// run now reports 75 so the ledger is honest, and this pins that the honesty stayed free.
	test('finalizeRunWorktree: a flailing run keeps its work and merges back', async () => {
		const root = await testTempDir('aidd-wt-test-');
		try {
			const projectDir = join(root, 'project');
			await initRepoWithCommit(projectDir);
			const wt = (await createRunWorktree(projectDir, 'run1', {
				baseDir: join(root, 'wt'),
			}))!;
			await commitInWorktree(wt.dir, 'new.txt', 'from worktree\n');

			const finalization = await finalizeRunWorktree({
				exitCode: orchestratorExitCodes.flailing,
				projectDir,
				session: emptySession(),
				worktree: wt,
			});
			expect(finalization.overrideExitCode).toBeUndefined();
			expect(finalization.mergeStatus).toBe('merged');
			expect(existsSync(join(projectDir, 'new.txt'))).toBe(true);
		} finally {
			await removeTempTree(root);
		}
	});

	// Build a project + worktree whose branches both modify file.txt, so merge-back conflicts.
	async function makeConflict(root: string) {
		const projectDir = join(root, 'project');
		await initRepoWithCommit(projectDir);
		const wt = (await createRunWorktree(projectDir, 'run1', { baseDir: join(root, 'wt') }))!;
		await commitInWorktree(wt.dir, 'file.txt', 'worktree side\n');
		await runGit(projectDir, ['config', 'user.email', 'test@aidd.local']);
		await runGit(projectDir, ['config', 'user.name', 'aidd test']);
		await writeFile(join(projectDir, 'file.txt'), 'project side\n');
		await runGit(projectDir, ['add', 'file.txt']);
		await runGit(projectDir, ['commit', '-m', 'project change']);
		return { projectDir, wt };
	}

	test('merge-back uses the resolver to complete a conflicted merge', async () => {
		const root = await testTempDir('aidd-wt-test-');
		try {
			const { projectDir, wt } = await makeConflict(root);
			const resolver = async (dir: string) => {
				await writeFile(join(dir, 'file.txt'), 'resolved\n');
				await runGit(dir, ['add', 'file.txt']);
				await runGit(dir, ['commit', '--no-edit']);
				return true;
			};
			expect((await mergeRunBack(projectDir, wt, resolver)).status).toBe('merged');
			// Merge committed with the resolved contents (no conflict markers left behind).
			const merged = await readFile(join(projectDir, 'file.txt'), 'utf8');
			expect(merged).toContain('resolved');
			expect(merged).not.toContain('<<<<<<<');
			await removeRunWorktree(projectDir, wt);
		} finally {
			await removeTempTree(root);
		}
	});

	test('merge-back aborts and reports conflict when the resolver declines', async () => {
		const root = await testTempDir('aidd-wt-test-');
		try {
			const { projectDir, wt } = await makeConflict(root);
			expect((await mergeRunBack(projectDir, wt, async () => false)).status).toBe('conflict');
			// Merge aborted: the project side is restored, no conflict markers left behind.
			const aborted = await readFile(join(projectDir, 'file.txt'), 'utf8');
			expect(aborted).toContain('project side');
			expect(aborted).not.toContain('<<<<<<<');
			await removeRunWorktree(projectDir, wt);
		} finally {
			await removeTempTree(root);
		}
	});
});
