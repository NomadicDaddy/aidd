import { describe, expect, test } from 'bun:test';
import { createFeatureLeaseService } from 'aidd-shared/metadata/feature-leases';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { createModeHandler } from '../../cli/src/modes/factory.ts';
import { writeRunSummary } from '../../cli/src/orchestrator/run/artifacts.ts';
import { noWorkStopReason } from '../../cli/src/orchestrator/run/preflight.ts';
import { createRunAccumulator } from '../../cli/src/orchestrator/run/run-accumulator.ts';
import { testTempDir } from '../_helpers/temp.ts';
import {
	FakeBackend,
	initializeGitProject,
	plan,
	rootDir,
	runGit,
} from './_helpers/orchestrator-fixture.ts';

async function makeLeaseProject(prefix: string): Promise<{
	projectDir: string;
	store: FileAiddStore;
}> {
	const projectDir = await testTempDir(prefix);
	await mkdir(join(projectDir, '.aidd', 'features'), { recursive: true });
	const store = new FileAiddStore(projectDir);
	await store.writeFeature({
		id: 'feat-one',
		passes: false,
		priority: 1,
		status: 'backlog',
		title: 'First',
	});
	await store.writeFeature({
		id: 'feat-two',
		passes: false,
		priority: 2,
		status: 'backlog',
		title: 'Second',
	});
	await initializeGitProject(projectDir);
	return { projectDir, store };
}

function leaseService(projectDir: string, runId: string) {
	return createFeatureLeaseService({ pid: process.pid, projectDir, runId });
}

describe('lease-aware coding selection', () => {
	test('the loser of a lease race selects the next eligible feature', async () => {
		const { projectDir, store } = await makeLeaseProject('aidd-lease-race-');
		// The competing run holds its lease from a LINKED WORKTREE checkout while this run
		// selects from the live tree — the mixed worktree/live-tree case must share one lease
		// namespace via git's common directory.
		const worktreeDir = join(await testTempDir('aidd-lease-race-wt-'), 'checkout');
		await runGit(projectDir, ['worktree', 'add', '--detach', worktreeDir]);
		const competitor = leaseService(worktreeDir, 'run-competitor');
		expect(await competitor.acquire('feat-one')).toEqual({ acquired: true });

		const loser = leaseService(projectDir, 'run-loser');
		const work = await createModeHandler(plan(projectDir)).selectWork({
			featureLeases: loser,
			projectDir,
			store,
		});
		expect(work.kind).toBe('feature');
		expect(work.id).toBe('feat-two');
		// The loser now owns feat-two's lease, so a third run cannot take it.
		const probe = await leaseService(projectDir, 'run-probe').acquire('feat-two');
		expect(probe.acquired).toBe(false);
	});

	test('untargeted selection ends no_work when every eligible feature is leased', async () => {
		const { projectDir, store } = await makeLeaseProject('aidd-lease-exhausted-');
		const competitor = leaseService(projectDir, 'run-competitor');
		expect(await competitor.acquire('feat-one')).toEqual({ acquired: true });
		expect(await competitor.acquire('feat-two')).toEqual({ acquired: true });

		const work = await createModeHandler(plan(projectDir)).selectWork({
			featureLeases: leaseService(projectDir, 'run-loser'),
			projectDir,
			store,
		});
		expect(work.kind).toBe('none');
		expect(work.description).toContain('leased by concurrent live runs');
		expect(noWorkStopReason(work)).toBe('no_work');
	});

	test('an explicit --feature launch is refused with the holder named', async () => {
		const { projectDir, store } = await makeLeaseProject('aidd-lease-explicit-');
		const competitor = leaseService(projectDir, 'run-competitor');
		expect(await competitor.acquire('feat-one')).toEqual({ acquired: true });

		const work = await createModeHandler(
			plan(projectDir, ['--feature', 'feat-one'])
		).selectWork({
			featureLeases: leaseService(projectDir, 'run-loser'),
			projectDir,
			store,
		});
		expect(work.kind).toBe('none');
		expect(work.description).toContain("Feature 'feat-one' is leased");
		expect(work.description).toContain('run-competitor');
		// The refusal surfaces as a blocked stop (red badge), not a neutral empty backlog.
		expect(noWorkStopReason(work)).toBe('blocked');
	});

	test('selection without a lease service is unchanged', async () => {
		const { projectDir, store } = await makeLeaseProject('aidd-lease-absent-');
		// Another run holds feat-one, but a context without a lease service (non-coding entry
		// points, existing tests) never consults leases.
		expect(await leaseService(projectDir, 'run-other').acquire('feat-one')).toEqual({
			acquired: true,
		});
		const work = await createModeHandler(plan(projectDir)).selectWork({ projectDir, store });
		expect(work.kind).toBe('feature');
		expect(work.id).toBe('feat-one');
	});

	test('writeRunSummary releases every lease the run holds at terminal outcomes', async () => {
		const { projectDir, store } = await makeLeaseProject('aidd-lease-release-');
		const runLeases = leaseService(projectDir, 'run-terminal');
		const runPlan = plan(projectDir);
		const work = await createModeHandler(runPlan).selectWork({
			featureLeases: runLeases,
			projectDir,
			store,
		});
		expect(work.id).toBe('feat-one');

		// Every terminal outcome — completion, failure, no-work, parked merge — funnels through
		// writeRunSummary, so releasing here covers all of them.
		await writeRunSummary(
			{ backend: new FakeBackend([]), featureLeases: runLeases, rootDir, store },
			runPlan,
			createRunAccumulator('run-terminal', Date.now()),
			'exit_error',
			1,
			'run failed'
		);
		const probe = await leaseService(projectDir, 'run-next').acquire('feat-one');
		expect(probe).toEqual({ acquired: true });
	});
});
