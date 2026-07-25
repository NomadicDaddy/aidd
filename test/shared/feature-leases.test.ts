import { describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import {
	createFeatureLeaseService,
	reapRunFeatureLeases,
	resolveFeatureLeaseDir,
} from '../../shared/src/metadata/feature-leases.ts';
import { testTempDir } from '../_helpers/temp.ts';

async function runGit(cwd: string, args: string[]): Promise<void> {
	const proc = Bun.spawn(['git', '-C', cwd, ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if ((await proc.exited) !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(`git ${args.join(' ')} failed: ${stderr}`);
	}
}

async function makeGitProject(prefix: string): Promise<string> {
	const dir = await testTempDir(prefix);
	await runGit(dir, ['init']);
	await writeFile(
		join(dir, '.git', 'config'),
		'[user]\n\temail = aidd-test@example.invalid\n\tname = aidd Test\n',
		{ flag: 'a' },
	);
	return dir;
}

async function deadPid(): Promise<number> {
	const proc = Bun.spawn([process.execPath, '-e', ''], { windowsHide: true });
	await proc.exited;
	return proc.pid;
}

describe('feature leases', () => {
	test('acquisition is exclusive across runs and reentrant within one run', async () => {
		const projectDir = await makeGitProject('aidd-lease-basic-');
		const runA = createFeatureLeaseService({ pid: process.pid, projectDir, runId: 'run-a' });
		const runB = createFeatureLeaseService({ pid: process.pid, projectDir, runId: 'run-b' });

		expect(await runA.acquire('feat-x')).toEqual({ acquired: true });
		// Reentrant: iteration 2 of the same run re-acquires its own lease.
		expect(await runA.acquire('feat-x')).toEqual({ acquired: true });

		const denied = await runB.acquire('feat-x');
		expect(denied.acquired).toBe(false);
		if (!denied.acquired) {
			expect(denied.holder?.runId).toBe('run-a');
			expect(denied.holder?.featureId).toBe('feat-x');
		}

		// The lease lives under git's common directory, keyed by normalized feature id.
		const leaseDir = await resolveFeatureLeaseDir(projectDir);
		expect(leaseDir).toBe(join(projectDir, '.git', 'aidd-feature-leases'));
		expect(await readdir(leaseDir!)).toContain('feat-x.json');
	});

	test('a linked worktree observes leases taken from the main checkout', async () => {
		const projectDir = await makeGitProject('aidd-lease-worktree-');
		await writeFile(join(projectDir, 'README.md'), 'lease test\n');
		await runGit(projectDir, ['add', '.']);
		await runGit(projectDir, ['commit', '-m', 'init']);
		const worktreeDir = join(await testTempDir('aidd-lease-wt-'), 'checkout');
		await runGit(projectDir, ['worktree', 'add', '--detach', worktreeDir]);

		const mainRun = createFeatureLeaseService({
			pid: process.pid,
			projectDir,
			runId: 'run-main',
		});
		const worktreeRun = createFeatureLeaseService({
			pid: process.pid,
			projectDir: worktreeDir,
			runId: 'run-worktree',
		});
		// Both roots resolve to the SAME lease directory (git's common dir).
		expect(await resolveFeatureLeaseDir(worktreeDir)).toBe(
			await resolveFeatureLeaseDir(projectDir),
		);
		expect(await mainRun.acquire('feat-shared')).toEqual({ acquired: true });
		const denied = await worktreeRun.acquire('feat-shared');
		expect(denied.acquired).toBe(false);
		if (!denied.acquired) expect(denied.holder?.runId).toBe('run-main');
	});

	test('a lease whose holder pid is provably dead is reclaimed at acquisition', async () => {
		const projectDir = await makeGitProject('aidd-lease-steal-');
		const dead = createFeatureLeaseService({
			pid: await deadPid(),
			projectDir,
			runId: 'run-dead',
		});
		const live = createFeatureLeaseService({ pid: process.pid, projectDir, runId: 'run-live' });

		expect(await dead.acquire('feat-y')).toEqual({ acquired: true });
		// The dead holder's lease is stolen; the live run now owns it.
		expect(await live.acquire('feat-y')).toEqual({ acquired: true });
		const denied = await dead.acquire('feat-y');
		expect(denied.acquired).toBe(false);
		if (!denied.acquired) expect(denied.holder?.runId).toBe('run-live');
	});

	test('releaseAll releases only the releasing run leases', async () => {
		const projectDir = await makeGitProject('aidd-lease-release-');
		const runA = createFeatureLeaseService({ pid: process.pid, projectDir, runId: 'run-a' });
		const runB = createFeatureLeaseService({ pid: process.pid, projectDir, runId: 'run-b' });
		const runC = createFeatureLeaseService({ pid: process.pid, projectDir, runId: 'run-c' });

		expect(await runA.acquire('feat-one')).toEqual({ acquired: true });
		expect(await runA.acquire('feat-two')).toEqual({ acquired: true });
		expect(await runB.acquire('feat-three')).toEqual({ acquired: true });

		await runA.releaseAll();
		// run-a's leases are free again; run-b's survives.
		expect(await runC.acquire('feat-one')).toEqual({ acquired: true });
		expect(await runC.acquire('feat-two')).toEqual({ acquired: true });
		const denied = await runC.acquire('feat-three');
		expect(denied.acquired).toBe(false);
		if (!denied.acquired) expect(denied.holder?.runId).toBe('run-b');
	});

	test('reapRunFeatureLeases deletes only the dead run leases', async () => {
		const projectDir = await makeGitProject('aidd-lease-reap-');
		const deadRun = createFeatureLeaseService({
			pid: await deadPid(),
			projectDir,
			runId: 'run-dead',
		});
		const liveRun = createFeatureLeaseService({
			pid: process.pid,
			projectDir,
			runId: 'run-live',
		});
		expect(await deadRun.acquire('feat-a')).toEqual({ acquired: true });
		expect(await deadRun.acquire('feat-b')).toEqual({ acquired: true });
		expect(await liveRun.acquire('feat-c')).toEqual({ acquired: true });

		expect(await reapRunFeatureLeases(projectDir, 'run-dead')).toBe(2);
		expect(await reapRunFeatureLeases(projectDir, 'run-unknown')).toBe(0);

		const probe = createFeatureLeaseService({ pid: process.pid, projectDir, runId: 'run-p' });
		expect(await probe.acquire('feat-a')).toEqual({ acquired: true });
		expect(await probe.acquire('feat-b')).toEqual({ acquired: true });
		const denied = await probe.acquire('feat-c');
		expect(denied.acquired).toBe(false);
		if (!denied.acquired) expect(denied.holder?.runId).toBe('run-live');
	});

	test('feature ids are normalized to one lease key', async () => {
		const projectDir = await makeGitProject('aidd-lease-normalize-');
		const runA = createFeatureLeaseService({ pid: process.pid, projectDir, runId: 'run-a' });
		const runB = createFeatureLeaseService({ pid: process.pid, projectDir, runId: 'run-b' });
		expect(await runA.acquire('My Feature!')).toEqual({ acquired: true });
		const denied = await runB.acquire('my-feature-');
		expect(denied.acquired).toBe(false);
	});

	test('a non-git project has no lease surface: acquire trivially succeeds, reap is a no-op', async () => {
		// The shared test temp root lives INSIDE the aidd checkout, where rev-parse would
		// resolve this repository's own .git — so a genuinely repository-free directory must
		// come from the OS temp dir instead.
		const plainDir = await mkdtemp(join(tmpdir(), 'aidd-lease-plain-'));
		try {
			expect(await resolveFeatureLeaseDir(plainDir)).toBeNull();
			const service = createFeatureLeaseService({
				pid: process.pid,
				projectDir: plainDir,
				runId: 'run-x',
			});
			expect(await service.acquire('feat-z')).toEqual({ acquired: true });
			await service.releaseAll();
			expect(await reapRunFeatureLeases(plainDir, 'run-x')).toBe(0);
		} finally {
			await removeTempTree(plainDir);
		}
	});
});
