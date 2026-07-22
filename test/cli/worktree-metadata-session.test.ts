import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { FileAiddStore } from '../../shared/src/metadata/store.ts';
import { orchestratorExitCodes } from '../../shared/src/orchestrator/result.ts';
import {
	finalizeRunWorktree,
	persistRunEvidence,
} from '../../cli/src/orchestrator/run/worktree-evidence.ts';
import { createRunWorktree } from '../../cli/src/orchestrator/run/worktree-manager.ts';
import {
	seedWorktreeMetadata,
	writeBackWorktreeMetadata,
} from '../../cli/src/orchestrator/run/worktree-metadata-session.ts';
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

function featureJson(id: string, status = 'backlog'): string {
	return `${JSON.stringify({ description: `spec for ${id}`, id, passes: false, priority: 1, status, title: id }, null, 2)}\n`;
}

// A project shaped like every supported profile: `.aidd/` is gitignored (committed HEAD knows
// nothing about it), yet the live tree holds features, docs, and volatile run state.
async function initProjectWithIgnoredMetadata(projectDir: string): Promise<void> {
	await mkdir(projectDir, { recursive: true });
	await runGit(projectDir, ['init', '-b', 'main']);
	await appendFile(
		join(projectDir, '.git', 'config'),
		'[user]\n\temail = test@aidd.local\n\tname = aidd test\n'
	);
	await writeFile(join(projectDir, '.gitignore'), '/.aidd/\n');
	await writeFile(join(projectDir, 'file.txt'), 'base\n');
	await runGit(projectDir, ['add', '.']);
	await runGit(projectDir, ['commit', '-m', 'base']);
	const metadataDir = join(projectDir, '.aidd');
	await mkdir(join(metadataDir, 'features', 'feat-a'), { recursive: true });
	await mkdir(join(metadataDir, 'features', 'feat-b'), { recursive: true });
	await writeFile(join(metadataDir, 'features', 'feat-a', 'feature.json'), featureJson('feat-a'));
	await writeFile(join(metadataDir, 'features', 'feat-b', 'feature.json'), featureJson('feat-b'));
	await writeFile(join(metadataDir, 'spec.md'), 'project spec\n');
	// Volatile run state that must never reach the worktree.
	await writeFile(join(metadataDir, 'runs.jsonl'), '{"runId":"run_old"}\n');
	await mkdir(join(metadataDir, 'active-runs'), { recursive: true });
	await writeFile(join(metadataDir, 'active-runs', 'run_old.json'), '{}\n');
	await mkdir(join(metadataDir, 'iterations'), { recursive: true });
	await writeFile(join(metadataDir, 'iterations', '001.log'), 'old canonical iteration\n');
	await writeFile(join(metadataDir, '.stop'), '2026-01-01T00:00:00.000Z\n');
}

describe('worktree-metadata-session', () => {
	test('seeds gitignored .aidd features into the worktree store (no_work regression)', async () => {
		const root = await testTempDir('aidd-wtm-test-');
		try {
			const projectDir = join(root, 'project');
			await initProjectWithIgnoredMetadata(projectDir);
			const wt = (await createRunWorktree(projectDir, 'run1', {
				baseDir: join(root, 'wt'),
			}))!;

			// Before seeding the checkout has no metadata at all — the bug's precondition.
			expect(existsSync(join(wt.dir, '.aidd'))).toBe(false);

			const session = await seedWorktreeMetadata(projectDir, wt.dir);
			const worktreeStore = new FileAiddStore(wt.dir);
			const features = await worktreeStore.listFeatures();
			expect(features.map((feature) => feature.id).sort()).toEqual(['feat-a', 'feat-b']);
			expect(session.seededFiles).toBeGreaterThanOrEqual(3);
			// Volatile state stays behind: ledger, heartbeats, iterations, stop signal.
			expect(existsSync(join(wt.dir, '.aidd', 'runs.jsonl'))).toBe(false);
			expect(existsSync(join(wt.dir, '.aidd', 'active-runs'))).toBe(false);
			expect(existsSync(join(wt.dir, '.aidd', 'iterations'))).toBe(false);
			expect(existsSync(join(wt.dir, '.aidd', '.stop'))).toBe(false);
			// The seeded copy stays gitignored inside the worktree — never committed or merged.
			expect(await runGit(wt.dir, ['status', '--porcelain'])).toBe('');
		} finally {
			await removeTempTree(root);
		}
	});

	test('write-back applies only the run delta and preserves concurrent canonical edits', async () => {
		const root = await testTempDir('aidd-wtm-test-');
		try {
			const projectDir = join(root, 'project');
			await initProjectWithIgnoredMetadata(projectDir);
			const wt = (await createRunWorktree(projectDir, 'run1', {
				baseDir: join(root, 'wt'),
			}))!;
			const session = await seedWorktreeMetadata(projectDir, wt.dir);

			// The run: completes feat-a, creates a changelog, deletes feat-b, leaves spec.md alone.
			await writeFile(
				join(wt.dir, '.aidd', 'features', 'feat-a', 'feature.json'),
				featureJson('feat-a', 'completed')
			);
			await writeFile(join(wt.dir, '.aidd', 'CHANGELOG.md'), 'run change\n');
			await rm(join(wt.dir, '.aidd', 'features', 'feat-b', 'feature.json'));
			// Meanwhile an operator edits an untouched canonical file mid-run.
			await writeFile(join(projectDir, '.aidd', 'spec.md'), 'operator edit mid-run\n');

			const delta = await writeBackWorktreeMetadata(projectDir, wt.dir, session);
			expect(delta.applied.sort()).toEqual(['CHANGELOG.md', 'features/feat-a/feature.json']);
			expect(delta.deleted).toEqual(['features/feat-b/feature.json']);
			const featA = JSON.parse(
				await readFile(
					join(projectDir, '.aidd', 'features', 'feat-a', 'feature.json'),
					'utf8'
				)
			) as { status: string };
			expect(featA.status).toBe('completed');
			expect(await readFile(join(projectDir, '.aidd', 'CHANGELOG.md'), 'utf8')).toBe(
				'run change\n'
			);
			expect(
				existsSync(join(projectDir, '.aidd', 'features', 'feat-b', 'feature.json'))
			).toBe(false);
			// The file the run never touched keeps the operator's mid-run edit.
			expect(await readFile(join(projectDir, '.aidd', 'spec.md'), 'utf8')).toBe(
				'operator edit mid-run\n'
			);
		} finally {
			await removeTempTree(root);
		}
	});

	test('deleting a feature prunes its canonical directory so the next seed succeeds', async () => {
		const root = await testTempDir('aidd-wtm-test-');
		try {
			const projectDir = join(root, 'project');
			await initProjectWithIgnoredMetadata(projectDir);
			const wt1 = (await createRunWorktree(projectDir, 'run1', {
				baseDir: join(root, 'wt'),
			}))!;
			const session = await seedWorktreeMetadata(projectDir, wt1.dir);
			await rm(join(wt1.dir, '.aidd', 'features', 'feat-b', 'feature.json'));

			const delta = await writeBackWorktreeMetadata(projectDir, wt1.dir, session);
			expect(delta.deleted).toEqual(['features/feat-b/feature.json']);
			// The emptied directory must not linger — a stale dir would desync every later
			// parity check (the original repro: "metadata seeding incomplete: 1/2").
			expect(existsSync(join(projectDir, '.aidd', 'features', 'feat-b'))).toBe(false);
			expect(existsSync(join(projectDir, '.aidd', 'features'))).toBe(true);

			const wt2 = (await createRunWorktree(projectDir, 'run2', {
				baseDir: join(root, 'wt'),
			}))!;
			await seedWorktreeMetadata(projectDir, wt2.dir);
			const features = await new FileAiddStore(wt2.dir).listFeatures();
			expect(features.map((feature) => feature.id)).toEqual(['feat-a']);
		} finally {
			await removeTempTree(root);
		}
	});

	test('seeding tolerates a manifest-less directory under canonical features/', async () => {
		const root = await testTempDir('aidd-wtm-test-');
		try {
			const projectDir = join(root, 'project');
			await initProjectWithIgnoredMetadata(projectDir);
			// An empty scratch dir (operator leftovers, a historical pruning miss) must not
			// brick seeding — parity counts feature manifests, not directories.
			await mkdir(join(projectDir, '.aidd', 'features', 'scratch'), { recursive: true });
			const wt = (await createRunWorktree(projectDir, 'run1', {
				baseDir: join(root, 'wt'),
			}))!;

			const session = await seedWorktreeMetadata(projectDir, wt.dir);
			expect(session.seededFiles).toBeGreaterThanOrEqual(3);
			const features = await new FileAiddStore(wt.dir).listFeatures();
			expect(features.map((feature) => feature.id).sort()).toEqual(['feat-a', 'feat-b']);
		} finally {
			await removeTempTree(root);
		}
	});

	test('finalize preserves the worktree when evidence persistence fails', async () => {
		const root = await testTempDir('aidd-wtm-test-');
		try {
			const projectDir = join(root, 'project');
			await initProjectWithIgnoredMetadata(projectDir);
			const wt = (await createRunWorktree(projectDir, 'run1', {
				baseDir: join(root, 'wt'),
			}))!;
			const session = await seedWorktreeMetadata(projectDir, wt.dir);
			await mkdir(join(wt.dir, '.aidd', 'iterations'), { recursive: true });
			await writeFile(join(wt.dir, '.aidd', 'iterations', '001.log'), 'only copy\n');
			// Sabotage the canonical target: a FILE at .aidd/iterations makes mkdir/copy fail.
			await rm(join(projectDir, '.aidd', 'iterations'), { force: true, recursive: true });
			await writeFile(join(projectDir, '.aidd', 'iterations'), 'not a directory\n');

			const finalization = await finalizeRunWorktree({
				exitCode: orchestratorExitCodes.generalError,
				projectDir,
				session,
				worktree: wt,
			});
			expect(finalization.evidencePersistFailed).toBe(true);
			expect(finalization.evidenceFiles).toBe(0);
			// The worktree holds the only copy of the logs — it must survive.
			expect(existsSync(join(wt.dir, '.aidd', 'iterations', '001.log'))).toBe(true);
		} finally {
			await removeTempTree(root);
		}
	});

	test('persistRunEvidence renumbers run-local iterations onto fresh canonical indices', async () => {
		const root = await testTempDir('aidd-wtm-test-');
		try {
			const projectDir = join(root, 'project');
			await initProjectWithIgnoredMetadata(projectDir);
			const worktreeDir = join(root, 'wt-fake');
			await mkdir(join(worktreeDir, '.aidd', 'iterations'), { recursive: true });
			await writeFile(join(worktreeDir, '.aidd', 'iterations', '001.log'), 'run log one\n');
			await writeFile(
				join(worktreeDir, '.aidd', 'iterations', '001.json'),
				'{"iteration":1}\n'
			);
			await writeFile(join(worktreeDir, '.aidd', 'iterations', '002.log'), 'run log two\n');

			const copied = await persistRunEvidence(projectDir, worktreeDir);
			expect(copied).toBe(3);
			const iterationsDir = join(projectDir, '.aidd', 'iterations');
			// Canonical 001.log pre-existed; the run's evidence lands at 002/003.
			expect(await readFile(join(iterationsDir, '001.log'), 'utf8')).toBe(
				'old canonical iteration\n'
			);
			expect(await readFile(join(iterationsDir, '002.log'), 'utf8')).toBe('run log one\n');
			expect(await readFile(join(iterationsDir, '002.json'), 'utf8')).toBe(
				'{"iteration":1}\n'
			);
			expect(await readFile(join(iterationsDir, '003.log'), 'utf8')).toBe('run log two\n');
		} finally {
			await removeTempTree(root);
		}
	});

	test('finalize on success merges source, applies metadata, persists evidence', async () => {
		const root = await testTempDir('aidd-wtm-test-');
		try {
			const projectDir = join(root, 'project');
			await initProjectWithIgnoredMetadata(projectDir);
			const wt = (await createRunWorktree(projectDir, 'run1', {
				baseDir: join(root, 'wt'),
			}))!;
			const session = await seedWorktreeMetadata(projectDir, wt.dir);

			// The run: commits a source change, completes feat-a, writes an iteration log.
			await writeFile(join(wt.dir, 'new.txt'), 'from run\n');
			await runGit(wt.dir, ['add', '.']);
			await runGit(wt.dir, ['commit', '-m', 'feat-a work']);
			await writeFile(
				join(wt.dir, '.aidd', 'features', 'feat-a', 'feature.json'),
				featureJson('feat-a', 'completed')
			);
			await mkdir(join(wt.dir, '.aidd', 'iterations'), { recursive: true });
			await writeFile(join(wt.dir, '.aidd', 'iterations', '001.log'), 'iteration one\n');

			const finalization = await finalizeRunWorktree({
				exitCode: orchestratorExitCodes.success,
				projectDir,
				session,
				worktree: wt,
			});
			expect(finalization.mergeStatus).toBe('merged');
			expect(finalization.overrideExitCode).toBeUndefined();
			expect(finalization.metadataApplied).toBe(1);
			expect(finalization.evidenceFiles).toBe(1);
			expect(existsSync(join(projectDir, 'new.txt'))).toBe(true);
			const featA = JSON.parse(
				await readFile(
					join(projectDir, '.aidd', 'features', 'feat-a', 'feature.json'),
					'utf8'
				)
			) as { status: string };
			expect(featA.status).toBe('completed');
			expect(await readFile(join(projectDir, '.aidd', 'iterations', '002.log'), 'utf8')).toBe(
				'iteration one\n'
			);
			expect(existsSync(wt.dir)).toBe(false);
		} finally {
			await removeTempTree(root);
		}
	});

	test('finalize on failure keeps evidence but discards the metadata delta', async () => {
		const root = await testTempDir('aidd-wtm-test-');
		try {
			const projectDir = join(root, 'project');
			await initProjectWithIgnoredMetadata(projectDir);
			const wt = (await createRunWorktree(projectDir, 'run1', {
				baseDir: join(root, 'wt'),
			}))!;
			const session = await seedWorktreeMetadata(projectDir, wt.dir);
			await writeFile(
				join(wt.dir, '.aidd', 'features', 'feat-a', 'feature.json'),
				featureJson('feat-a', 'in_progress')
			);
			await mkdir(join(wt.dir, '.aidd', 'iterations'), { recursive: true });
			await writeFile(join(wt.dir, '.aidd', 'iterations', '001.log'), 'failed attempt\n');

			const finalization = await finalizeRunWorktree({
				exitCode: orchestratorExitCodes.generalError,
				projectDir,
				session,
				worktree: wt,
			});
			expect(finalization.mergeStatus).toBe('discarded');
			// Evidence survives the rollback; the half-done metadata does not.
			expect(await readFile(join(projectDir, '.aidd', 'iterations', '002.log'), 'utf8')).toBe(
				'failed attempt\n'
			);
			const featA = JSON.parse(
				await readFile(
					join(projectDir, '.aidd', 'features', 'feat-a', 'feature.json'),
					'utf8'
				)
			) as { status: string };
			expect(featA.status).toBe('backlog');
			expect(existsSync(wt.dir)).toBe(false);
		} finally {
			await removeTempTree(root);
		}
	});

	test('finalize on parked merge withholds metadata and preserves the worktree', async () => {
		const root = await testTempDir('aidd-wtm-test-');
		try {
			const projectDir = join(root, 'project');
			await initProjectWithIgnoredMetadata(projectDir);
			const wt = (await createRunWorktree(projectDir, 'run1', {
				baseDir: join(root, 'wt'),
			}))!;
			const session = await seedWorktreeMetadata(projectDir, wt.dir);
			await writeFile(join(wt.dir, 'new.txt'), 'from run\n');
			await runGit(wt.dir, ['add', '.']);
			await runGit(wt.dir, ['commit', '-m', 'feat-a work']);
			await writeFile(
				join(wt.dir, '.aidd', 'features', 'feat-a', 'feature.json'),
				featureJson('feat-a', 'completed')
			);
			await mkdir(join(wt.dir, '.aidd', 'iterations'), { recursive: true });
			await writeFile(join(wt.dir, '.aidd', 'iterations', '001.log'), 'parked run\n');
			// Dirty live tree blocks the merge → park.
			await writeFile(join(projectDir, 'file.txt'), 'operator edit\n');

			const finalization = await finalizeRunWorktree({
				exitCode: orchestratorExitCodes.success,
				projectDir,
				session,
				worktree: wt,
			});
			expect(finalization.overrideExitCode).toBe(orchestratorExitCodes.mergeConflictParked);
			expect(finalization.mergeStatus).toBe('blocked');
			// Nothing reached the live tree, so canonical metadata must not claim completion —
			// but the evidence is still persisted canonically.
			const featA = JSON.parse(
				await readFile(
					join(projectDir, '.aidd', 'features', 'feat-a', 'feature.json'),
					'utf8'
				)
			) as { status: string };
			expect(featA.status).toBe('backlog');
			expect(await readFile(join(projectDir, '.aidd', 'iterations', '002.log'), 'utf8')).toBe(
				'parked run\n'
			);
			expect(existsSync(wt.dir)).toBe(true);
		} finally {
			await removeTempTree(root);
		}
	});
});
