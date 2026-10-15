import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'aidd-shared/args/index';
import type { ResolvedConfig } from 'aidd-shared/config';
import { defaultWebConfig } from 'aidd-shared/config';
import { FileAiddStore } from 'aidd-shared/metadata/store';

import type { RunAiSummaryInput } from '../../cli/src/orchestrator/run/ai-summary.ts';
import { writeRunSummary } from '../../cli/src/orchestrator/run/artifacts.ts';
import {
	auditFeatureScope,
	captureFeatureCompletionSnapshot,
} from '../../cli/src/orchestrator/run/feature-scope.ts';
import { buildIterationStructured } from '../../cli/src/orchestrator/run/iteration-artifacts.ts';
import { accumulateIterationCommits } from '../../cli/src/orchestrator/run/run-accumulator.ts';
import { initialRunTotals, type RunAccumulator } from '../../cli/src/orchestrator/run/types.ts';
import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';

// A read-only run changes nothing, so whatever lands in the repository while it runs belongs to
// someone else. A read-only feature-review on deeper was credited with three of a teammate's
// commits and one of his completions, and its AI summary said it had done his work (#11791).

const tmpRoot = join(import.meta.dir, '..', '..', '.tmp-read-only-run-attribution-tests');

const config: ResolvedConfig = {
	cli: 'native',
	defaultProvider: 'zhipu',
	dirtyTreeThreshold: 50,
	idleNudgeTimeoutSeconds: 1,
	idleTimeoutSeconds: 1,
	maxConsecutiveTimeoutRetries: 2,
	maxIterations: 10,
	model: 'glm-5.3',
	noClean: false,
	noWorkBackoffMs: 0,
	preflightDoctor: false,
	quitOnAbort: 0,
	rateLimitBackoffSeconds: 300,
	rateLimitBufferSeconds: 60,
	reasoningEffort: 'low',
	timeoutSeconds: 3600,
	web: defaultWebConfig,
};

function planFor(projectDir: string, extra: string[]) {
	return resolveRunPlan(
		parseArgs(['--project-dir', projectDir, '--cli', 'native', ...extra]),
		config,
	);
}

const readOnlyArgs = ['--directive', '--directive-readonly', '--prompt=review only'];
const writingArgs = ['--directive', '--prompt=change things'];

function accumulator(): RunAccumulator {
	return {
		auditFindings: {},
		commandsRun: new Set<string>(),
		commitsCreated: [],
		completedFeatures: new Set<string>(),
		destroyedLeasedFeatures: [],
		filesCreated: new Set<string>(),
		filesEdited: new Set<string>(),
		forcedAttributionCommits: new Set<string>(),
		iterationDurationsMs: [],
		pendingCarryoverNotes: [],
		runId: 'run-read-only-test',
		runStartedAt: new Date().toISOString(),
		runStartedAtMs: Date.now() - 1000,
		runTotals: { ...initialRunTotals, iterations: 1 },
		scopeOverrun: false,
		scopeOverrunIterations: 0,
		selectedFeatures: new Set<string>(),
		toolBreakdownTotals: {},
	} as RunAccumulator;
}

async function git(projectDir: string, args: string[]): Promise<string> {
	const proc = Bun.spawn(['git', '-C', projectDir, ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	const out = await new Response(proc.stdout).text();
	if ((await proc.exited) !== 0) {
		throw new Error(`git ${args.join(' ')} failed: ${await new Response(proc.stderr).text()}`);
	}
	return out.trim();
}

async function writeFeature(projectDir: string, id: string, status: string): Promise<void> {
	const dir = join(projectDir, '.aidd', 'features', id);
	await mkdir(dir, { recursive: true });
	const passes = status === 'completed';
	await writeFile(join(dir, 'feature.json'), JSON.stringify({ id, passes, status, title: id }));
}

/** A repository with two features and a commit for each, as two sessions would make them. */
async function repository(name: string) {
	const projectDir = join(tmpRoot, name);
	await mkdir(projectDir, { recursive: true });
	await git(projectDir, ['init']);
	await git(projectDir, ['config', 'user.email', 'test@example.invalid']);
	await git(projectDir, ['config', 'user.name', 'Test']);
	await writeFeature(projectDir, 'feature-core', 'backlog');
	await writeFeature(projectDir, 'feature-other', 'backlog');
	await git(projectDir, ['add', '-A']);
	await git(projectDir, ['commit', '-m', 'initial']);
	const commit = async (id: string, subject: string) => {
		await writeFeature(projectDir, id, 'completed');
		await git(projectDir, ['add', '-A']);
		await git(projectDir, ['commit', '-m', subject]);
		return { hash: await git(projectDir, ['rev-parse', 'HEAD']), subject };
	};
	return { commit, projectDir, store: new FileAiddStore(projectDir) };
}

afterEach(async () => {
	await removeTempTree(tmpRoot);
});

describe('a read-only run attributes no commits', () => {
	const commits = [{ hash: 'a'.repeat(40), subject: "a teammate's commit" }];
	const work = { description: 'review', id: 'directive', kind: 'generic' as const };

	test('a read-only directive reports the commits in its window and records none', () => {
		const acc = accumulator();
		const unexpected = accumulateIterationCommits({
			acc,
			commits,
			plan: planFor(tmpRoot, readOnlyArgs),
			work,
		});
		expect(unexpected).toEqual([commits[0]!.hash]);
		expect(acc.commitsCreated).toEqual([]);
		expect(acc.runTotals.commitsCreated).toBe(0);
	});

	test('a writing directive still records the commits in its window', () => {
		const acc = accumulator();
		const unexpected = accumulateIterationCommits({
			acc,
			commits,
			plan: planFor(tmpRoot, writingArgs),
			work,
		});
		expect(unexpected).toEqual([]);
		expect(acc.commitsCreated).toEqual(commits);
	});
});

describe('a read-only iteration artifact lists no commits as its own', () => {
	const commit = { hash: 'b'.repeat(40), subject: "a teammate's commit" };

	function structured(unexpectedReadOnlyCommits: string[]) {
		return buildIterationStructured({
			acc: accumulator(),
			compiled: { snapshotKey: 'key', text: 'prompt' } as never,
			completionFinalizedBeforeBackendExit: false,
			completionPendingCommit: false,
			details: { commands: [], errors: [], filesCreated: [], filesEdited: [] } as never,
			durationMs: 1,
			endedAt: '2026-10-15T12:00:00.000Z',
			endedWithKilledBackgroundTasks: false,
			featureScope: { completedFeatures: [], invalidFeatureMetadata: [] } as never,
			findingsContractDropped: false,
			idleWarningTimestamps: [],
			iteration: 1,
			iterationCommits: [commit],
			iterationSummary: 'directive completed',
			malformedResultMarker: false,
			metrics: {} as never,
			missingAiddResult: false,
			missingAuditArtifacts: false,
			modeResult: { complete: true, summary: 'done' },
			plan: planFor(tmpRoot, readOnlyArgs),
			planningRecovery: undefined,
			recordedExitCode: 0,
			residualDirtyFilesCount: 0,
			startedAt: '2026-10-15T11:00:00.000Z',
			stopRequestedAfterRun: false,
			timeToFirstEventMs: undefined,
			triumvirateArtifacts: {},
			unexpectedReadOnlyCommits,
		});
	}

	test('the commits in a read-only window are listed apart, not as created', () => {
		const record = structured([commit.hash]);
		expect(record['commitsCreated']).toEqual([]);
		expect(record['commitsCreatedCount']).toBe(0);
		expect(record['unexpectedReadOnlyCommits']).toEqual([commit.hash]);
		// Control: an iteration that attributes its window's commits lists them as created.
		expect(structured([])['commitsCreated']).toEqual([commit]);
	});
});

describe('a read-only run completes no features', () => {
	test('a feature completed while a read-only run ran is not the run’s', async () => {
		const { projectDir, store } = await repository('scope-read-only');
		const before = await captureFeatureCompletionSnapshot(store);
		await writeFeature(projectDir, 'feature-other', 'completed');
		const work = { description: 'review', id: 'directive', kind: 'generic' as const };

		const readOnly = await auditFeatureScope(store, work, before, { readOnly: true });
		expect(readOnly.completedFeatures).toEqual([]);
		// Control: the same change, read by a writing run, is a completion.
		const writing = await auditFeatureScope(store, work, before);
		expect(writing.completedFeatures).toEqual(['feature-other']);
	});
});

describe('the AI summary sees only attributed commits', () => {
	test('a commit the ledger does not attribute never reaches the summarizer', async () => {
		const { commit, projectDir, store } = await repository('summary');
		const own = await commit('feature-core', 'complete feature-core');
		const theirs = await commit('feature-other', "a teammate's completion");
		const acc = accumulator();
		acc.commitsCreated.push(own, theirs);
		acc.completedFeatures.add('feature-core');

		let input: RunAiSummaryInput | undefined;
		await writeRunSummary(
			{
				aiSummarizer: async (received) => {
					input = received;
					return 'summary';
				},
				backend: { idleDefaults: { killMs: 20, nudgeMs: 10 }, name: 'native' } as never,
				rootDir: projectDir,
				store,
			},
			planFor(projectDir, writingArgs),
			acc,
			'completed',
			0,
			'completed',
		);

		expect(input?.commits.map((c) => c.hash)).toEqual([own.hash]);
	});
});
