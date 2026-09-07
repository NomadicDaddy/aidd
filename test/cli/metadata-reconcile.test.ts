import { describe, expect, test } from 'bun:test';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { RunPlan } from 'aidd-shared/plan/types';

import type { OrchestratorDeps, RunAccumulator } from '../../cli/src/orchestrator/run/types.ts';

import { reconcileRunMetadata } from '../../cli/src/orchestrator/run/metadata-reconcile.ts';
import { testTempDir } from '../_helpers/temp.ts';

async function writeJson(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(value, null, '\t')}\n`);
}

function deps(projectDir: string): OrchestratorDeps {
	return { store: new FileAiddStore(projectDir) } as unknown as OrchestratorDeps;
}

function acc(iterations: number): RunAccumulator {
	return { runTotals: { iterations } } as unknown as RunAccumulator;
}

function readonlyPlan(): RunPlan {
	return { prompt: { customDirectiveReadonly: true } } as unknown as RunPlan;
}

async function drifted(): Promise<string> {
	const projectDir = await testTempDir('aidd-run-reconcile-');
	await writeJson(join(projectDir, '.aidd', 'features', 'feature-base', 'feature.json'), {
		description: 'base work',
		id: 'feature-base',
		priority: 9,
		status: 'completed',
		title: 'Base',
	});
	await writeJson(join(projectDir, '.aidd', 'roadmap.json'), {
		features: { 'feature-base': { dependencies: [], milestone: 'MVP' } },
		milestones: { MVP: { priority: 1 } },
	});
	return projectDir;
}

describe('reconcileRunMetadata', () => {
	test('reports the applied roadmap in the skill reporting vocabulary', async () => {
		const projectDir = await drifted();
		expect(await reconcileRunMetadata(deps(projectDir), acc(1))).toBe(
			'roadmap applied: 1 updated, 0 unchanged, 1 dependency set(s) resolved',
		);
	});

	test('stays silent when nothing drifted, so quiet runs keep a clean summary', async () => {
		const projectDir = await drifted();
		await reconcileRunMetadata(deps(projectDir), acc(1));
		expect(await reconcileRunMetadata(deps(projectDir), acc(1))).toBeNull();
	});

	// Preflight-blocked, no-work, and encoding-guard runs never reached an agent.
	test('skips zero-iteration runs entirely', async () => {
		const projectDir = await drifted();
		expect(await reconcileRunMetadata(deps(projectDir), acc(0))).toBeNull();
	});

	// Metadata bookkeeping must never be the reason a run's outcome changes.
	test('fails soft when the store throws', async () => {
		const broken = { store: {} } as unknown as OrchestratorDeps;
		expect(await reconcileRunMetadata(broken, acc(1))).toBeNull();
	});

	// `--directive-readonly` (web/pipeline `review-only`) promises the operator the run leaves the
	// project alone; a `.aidd` record is part of the project.
	test('reports drift without writing it on a read-only run', async () => {
		const projectDir = await drifted();
		expect(await reconcileRunMetadata(deps(projectDir), acc(1), readonlyPlan())).toBe(
			'roadmap drift: 1 feature record(s) disagree with the roadmap — not rewritten, this run is read-only',
		);
		const raw = await readFile(
			join(projectDir, '.aidd', 'features', 'feature-base', 'feature.json'),
			'utf8',
		);
		expect(JSON.parse(raw)).toMatchObject({ priority: 9 });
	});

	test('writes as usual when the run is not read-only', async () => {
		const projectDir = await drifted();
		const plan = { prompt: {} } as unknown as RunPlan;
		expect(await reconcileRunMetadata(deps(projectDir), acc(1), plan)).toBe(
			'roadmap applied: 1 updated, 0 unchanged, 1 dependency set(s) resolved',
		);
	});
});
