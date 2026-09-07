import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	createFeatureLeaseService,
	readActiveFeatureLeases,
	resolveFeatureLeaseDir,
} from 'aidd-shared/metadata/feature-leases';
import { removeTempTree } from 'aidd-shared/lib/remove-temp-tree';
import { FileAiddStore } from 'aidd-shared/metadata/store';

import type {
	FeatureCompletionSnapshot,
	FinalizeIterationResult,
	OrchestratorDeps,
	RunAccumulator,
} from '../../cli/src/orchestrator/run/types.ts';

import { captureFeatureCompletionSnapshot } from '../../cli/src/orchestrator/run/feature-scope.ts';
import { endRunIfIterationGuardTripped } from '../../cli/src/orchestrator/run/post-iteration-guards.ts';
import { renderLeasedFeatures } from '../../cli/src/prompts/compile/leased-features.ts';
import { testTempDir } from '../_helpers/temp.ts';

// Coding runs coordinate through exclusive feature leases, so two of them cannot select the same
// feature. Directive and skill runs select nothing and hold no lease, so nothing told them a
// feature was already claimed — and a `consolidate-features` directive deleted a feature record
// out from under the coding run that was mid-implementation on it (run_1787610769365_f3b58391).

async function makeGitProject(prefix: string): Promise<string> {
	const dir = await testTempDir(prefix);
	const proc = Bun.spawn(['git', '-C', dir, 'init'], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if ((await proc.exited) !== 0) throw new Error('git init failed');
	return dir;
}

async function deadPid(): Promise<number> {
	const proc = Bun.spawn([process.execPath, '-e', ''], { windowsHide: true });
	await proc.exited;
	return proc.pid;
}

describe('readActiveFeatureLeases', () => {
	test('reports live leases and omits ones whose holder is dead', async () => {
		const projectDir = await makeGitProject('aidd-active-leases-');
		const leases = createFeatureLeaseService({
			pid: process.pid,
			projectDir,
			runId: 'run_live',
		});
		expect((await leases.acquire('feature-alpha')).acquired).toBe(true);
		expect((await leases.acquire('feature-beta')).acquired).toBe(true);

		// A crashed run's lease is reclaimable at the next acquisition, so reporting it as held
		// would fence off a feature in the name of a run that no longer exists.
		const leaseDir = await resolveFeatureLeaseDir(projectDir);
		expect(leaseDir).not.toBeNull();
		await writeFile(
			join(leaseDir as string, 'feature-ghost.json'),
			JSON.stringify({
				acquiredAt: new Date().toISOString(),
				featureId: 'feature-ghost',
				pid: await deadPid(),
				runId: 'run_crashed',
			}),
		);

		const active = await readActiveFeatureLeases(projectDir);

		expect(active.map((lease) => lease.featureId)).toEqual(['feature-alpha', 'feature-beta']);
		expect(active.every((lease) => lease.runId === 'run_live')).toBe(true);

		await leases.releaseAll();
		expect(await readActiveFeatureLeases(projectDir)).toEqual([]);
	});

	test('a project with no lease directory reports nothing', async () => {
		const dir = await testTempDir('aidd-active-leases-none-');
		await mkdir(join(dir, '.aidd'), { recursive: true });
		expect(await readActiveFeatureLeases(dir)).toEqual([]);
	});
});

describe('leased-feature prompt notice', () => {
	test('renders nothing when no other run holds a lease', () => {
		// Keeps the section out of every prompt snapshot and out of the single-run case.
		expect(renderLeasedFeatures([])).toBeUndefined();
	});

	test('names each claimed record, its holder, and the prohibition', () => {
		const rendered = renderLeasedFeatures([
			{ featureId: 'remediation-pipeline-progress', runId: 'run_abc' },
		]);

		expect(rendered).toContain('remediation-pipeline-progress');
		expect(rendered).toContain('run_abc');
		expect(rendered).toContain('consolidate');
		expect(rendered).toContain('Reading it is fine');
	});
});

function accumulator(runId: string): RunAccumulator {
	return {
		destroyedLeasedFeatures: [],
		pendingCarryoverNotes: [],
		runId,
		scopeOverrunIterations: 0,
	} as unknown as RunAccumulator;
}

function finalize(): FinalizeIterationResult {
	return {
		displayedSummary: 'did work',
		featureScope: {
			completionMarkerIssue: undefined,
			extraCompletedFeatures: [],
			invalidFeatureMetadata: [],
			scopeOverrun: false,
			unacceptedCompletedFeatures: [],
		},
	} as unknown as FinalizeIterationResult;
}

/** What the orchestrator captures immediately before dispatching the backend. Taking it from the
 * real store keeps the test honest about the guard's precondition: only a record this run could
 * see at iteration start can be reported as one this run destroyed. */
async function snapshot(projectDir: string): Promise<FeatureCompletionSnapshot> {
	return await captureFeatureCompletionSnapshot(new FileAiddStore(projectDir));
}

async function runGuard(
	projectDir: string,
	runId: string,
	featureSnapshotBefore: FeatureCompletionSnapshot,
): Promise<RunAccumulator> {
	const acc = accumulator(runId);
	const exit = await endRunIfIterationGuardTripped({
		acc,
		deps: { store: new FileAiddStore(projectDir) } as unknown as OrchestratorDeps,
		featureSnapshotBefore,
		finalize: finalize(),
		move: () => undefined,
		plan: { projectDir } as never,
		wallClockTimedOut: false,
		work: { kind: 'directive' } as never,
	});
	// Advisory, like the other metadata guards: the agent is the one who can fix it.
	expect(exit).toBeUndefined();
	return acc;
}

describe('destroyed leased-feature guard', () => {
	test('names a record deleted while another live run held its lease', async () => {
		const projectDir = await makeGitProject('aidd-lease-destroyed-');
		const featureDir = join(projectDir, '.aidd', 'features', 'feature-claimed');
		await mkdir(featureDir, { recursive: true });
		await writeFile(
			join(featureDir, 'feature.json'),
			JSON.stringify({ id: 'feature-claimed', passes: false, status: 'in_progress' }),
		);
		const holder = createFeatureLeaseService({
			pid: process.pid,
			projectDir,
			runId: 'run_holder',
		});
		expect((await holder.acquire('feature-claimed')).acquired).toBe(true);
		const before = await snapshot(projectDir);

		// What the concurrent consolidation did: fold the record away and delete its directory.
		await removeTempTree(featureDir);

		const acc = await runGuard(projectDir, 'run_offender', before);

		expect(acc.pendingCarryoverNotes).toHaveLength(1);
		expect(acc.pendingCarryoverNotes[0]).toContain('feature-claimed');
		expect(acc.pendingCarryoverNotes[0]).toContain('run_holder');
		// The note alone reaches only a run that compiles another prompt. A one-iteration directive
		// never does, so the same finding has to ride the accumulator into the run summary.
		expect(acc.destroyedLeasedFeatures).toEqual([
			{ featureId: 'feature-claimed', runId: 'run_holder' },
		]);
		await holder.releaseAll();
	});

	test('stays silent when the record was never in this run’s store to begin with', async () => {
		// The isolated-worktree shape: leases live in git's common directory and are shared, but a
		// worktree run reads a seed-time copy of `.aidd`. A feature created and leased canonically
		// after that seed was never in this store, so its absence is not evidence of deletion.
		const projectDir = await makeGitProject('aidd-lease-unseen-');
		await mkdir(join(projectDir, '.aidd', 'features'), { recursive: true });
		const before = await snapshot(projectDir);
		const holder = createFeatureLeaseService({
			pid: process.pid,
			projectDir,
			runId: 'run_holder',
		});
		expect((await holder.acquire('feature-created-later')).acquired).toBe(true);

		const acc = await runGuard(projectDir, 'run_offender', before);

		expect(acc.pendingCarryoverNotes).toEqual([]);
		expect(acc.destroyedLeasedFeatures).toEqual([]);
		await holder.releaseAll();
	});

	test('stays silent when the leased record is intact', async () => {
		const projectDir = await makeGitProject('aidd-lease-intact-');
		await mkdir(join(projectDir, '.aidd', 'features', 'feature-claimed'), { recursive: true });
		await writeFile(
			join(projectDir, '.aidd', 'features', 'feature-claimed', 'feature.json'),
			JSON.stringify({ id: 'feature-claimed', passes: false, status: 'in_progress' }),
		);
		const holder = createFeatureLeaseService({
			pid: process.pid,
			projectDir,
			runId: 'run_holder',
		});
		expect((await holder.acquire('feature-claimed')).acquired).toBe(true);
		const before = await snapshot(projectDir);

		expect((await runGuard(projectDir, 'run_offender', before)).pendingCarryoverNotes).toEqual(
			[],
		);
		await holder.releaseAll();
	});

	test("ignores this run's own lease, so a coding run is never warned about itself", async () => {
		const projectDir = await makeGitProject('aidd-lease-self-');
		const featureDir = join(projectDir, '.aidd', 'features', 'feature-gone');
		await mkdir(featureDir, { recursive: true });
		await writeFile(
			join(featureDir, 'feature.json'),
			JSON.stringify({ id: 'feature-gone', passes: false, status: 'in_progress' }),
		);
		const own = createFeatureLeaseService({ pid: process.pid, projectDir, runId: 'run_self' });
		expect((await own.acquire('feature-gone')).acquired).toBe(true);
		// Seeded and snapshotted so every other precondition for the accusation is met; the run's
		// own lease is the only thing left to silence it.
		const before = await snapshot(projectDir);
		await removeTempTree(featureDir);

		expect((await runGuard(projectDir, 'run_self', before)).pendingCarryoverNotes).toEqual([]);
		await own.releaseAll();
	});
});
