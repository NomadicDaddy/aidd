import type { RunPlan } from 'aidd-shared/plan/types';

import { FileAiddStore } from 'aidd-shared/metadata/store';
import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	prepareWorktreeRun,
	rollbackWorktreeRun,
	worktreeOrchestratorDeps,
} from '../../cli/src/orchestrator/run/worktree-run-setup.ts';
import { removeRunWorktree } from '../../cli/src/orchestrator/run/worktree-manager.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../backend/_helpers/remove-temp-tree.ts';

const roots: string[] = [];

function git(cwd: string, ...args: string[]): void {
	const result = Bun.spawnSync(['git', '-C', cwd, ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
}

async function project(committed: boolean): Promise<string> {
	const root = await testTempDir('aidd-worktree-setup-');
	roots.push(root);
	git(root, 'init');
	git(root, 'config', 'user.email', 'test@example.com');
	git(root, 'config', 'user.name', 'aidd test');
	await mkdir(join(root, '.aidd'), { recursive: true });
	await writeFile(join(root, '.aidd', 'spec.md'), '# Spec\n');
	await writeFile(join(root, '.gitignore'), '.aidd/\n');
	await writeFile(join(root, 'README.md'), '# Fixture\n');
	if (committed) {
		git(root, 'add', '.gitignore', 'README.md');
		git(root, 'commit', '-m', 'base');
	}
	return root;
}

function plan(projectDir: string, mode: RunPlan['mode'] = 'coding'): RunPlan {
	return { mode, projectDir } as RunPlan;
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => removeTempTree(root)));
});

describe('worktree run setup', () => {
	test('skips when not requested or outside coding mode', async () => {
		const root = await project(false);
		expect(
			await prepareWorktreeRun({ plan: plan(root), requested: false, runId: 'one' }),
		).toBeNull();
		expect(
			await prepareWorktreeRun({ plan: plan(root, 'audit'), requested: true, runId: 'two' }),
		).toBeNull();
	});

	test('falls back when the repository has no committed HEAD', async () => {
		const root = await project(false);
		expect(
			await prepareWorktreeRun({ plan: plan(root), requested: true, runId: 'unborn' }),
		).toBeNull();
	});

	test('sets the plan worktree and seeds canonical metadata', async () => {
		const root = await project(true);
		const runPlan = plan(root);
		const context = await prepareWorktreeRun({
			plan: runPlan,
			requested: true,
			runId: 'seeded',
			webDataDir: join(root, 'data'),
		});
		expect(context?.session.seededFiles).toBeGreaterThan(0);
		expect(runPlan.worktree?.dir).toContain('seeded');
		if (runPlan.worktree) await removeRunWorktree(root, runPlan.worktree);
	});

	test('requires plan.worktree and retains the canonical ledger store', async () => {
		const root = await project(false);
		const canonicalStore = new FileAiddStore(root);
		expect(() =>
			worktreeOrchestratorDeps(
				plan(root),
				{ session: { baseline: new Map(), seededFiles: 1 } },
				canonicalStore,
				async () => false,
			),
		).toThrow('worktreeOrchestratorDeps requires plan.worktree');
		const runPlan = plan(root);
		runPlan.worktree = { baseSha: 'base', branch: 'branch', dir: 'worktree' };
		expect(
			worktreeOrchestratorDeps(
				runPlan,
				{ session: { baseline: new Map(), seededFiles: 1 } },
				canonicalStore,
				async () => false,
			).ledgerStore,
		).toBe(canonicalStore);
	});

	test('preserves the worktree when evidence persistence fails', async () => {
		const root = await project(true);
		const runPlan = plan(root);
		await prepareWorktreeRun({
			plan: runPlan,
			requested: true,
			runId: 'preserved',
			webDataDir: join(root, 'data'),
		});
		const worktree = runPlan.worktree;
		expect(worktree).toBeDefined();
		await mkdir(join(worktree?.dir ?? '', '.aidd', 'iterations'), { recursive: true });
		await writeFile(join(worktree?.dir ?? '', '.aidd', 'iterations', '001.log'), 'evidence');
		await writeFile(join(root, '.aidd', 'iterations'), 'blocks directory creation');
		await rollbackWorktreeRun(runPlan);
		expect(existsSync(worktree?.dir ?? '')).toBe(true);
		if (worktree) await removeRunWorktree(root, worktree);
	});

	test('removes the worktree after evidence is persisted', async () => {
		const root = await project(true);
		const runPlan = plan(root);
		await prepareWorktreeRun({
			plan: runPlan,
			requested: true,
			runId: 'removed',
			webDataDir: join(root, 'data'),
		});
		const dir = runPlan.worktree?.dir ?? '';
		await rollbackWorktreeRun(runPlan);
		expect(existsSync(dir)).toBe(false);
	});
});
