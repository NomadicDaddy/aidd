import { describe, expect, test } from 'bun:test';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type {
	FeatureCompletionSnapshot,
	FinalizeIterationResult,
	OrchestratorDeps,
	RunAccumulator,
} from '../../cli/src/orchestrator/run/types.ts';

import { endRunIfIterationGuardTripped } from '../../cli/src/orchestrator/run/post-iteration-guards.ts';
import { testTempDir } from '../_helpers/temp.ts';

async function writeJson(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(value, null, '\t')}\n`);
}

/** These cases exercise the contract/audit guards, which never consult the inventory; the
 * leased-feature deletion guard is covered on its own in leased-feature-protection.test.ts. */
function emptySnapshot(): FeatureCompletionSnapshot {
	return { completed: new Map(), unreadable: [] };
}

function accumulator(): RunAccumulator {
	return {
		destroyedLeasedFeatures: [],
		pendingCarryoverNotes: [],
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

async function runGuard(projectDir: string): Promise<RunAccumulator> {
	const acc = accumulator();
	const exit = await endRunIfIterationGuardTripped({
		acc,
		deps: { store: new FileAiddStore(projectDir) } as unknown as OrchestratorDeps,
		featureSnapshotBefore: emptySnapshot(),
		finalize: finalize(),
		move: () => undefined,
		plan: {} as never,
		wallClockTimedOut: false,
		work: { kind: 'directive' } as never,
	});
	// Advisory by design: the agent is the one who can fix a contract, so the run continues.
	expect(exit).toBeUndefined();
	return acc;
}

async function healthyProject(prefix: string): Promise<string> {
	const projectDir = await testTempDir(prefix);
	await writeJson(join(projectDir, '.aidd', 'features', 'feature-base', 'feature.json'), {
		description: 'base work',
		id: 'feature-base',
		status: 'backlog',
		title: 'Base',
	});
	return projectDir;
}

describe('post-iteration feature contract check', () => {
	// aidd validates the collection itself rather than leaving skills to run `--check-features`
	// mid-run, and the agent has to see the result while it can still act on it.
	test('hands the next iteration a repair note when a contract is broken', async () => {
		const projectDir = await healthyProject('aidd-contract-broken-');
		await writeJson(join(projectDir, '.aidd', 'features', 'feature-child', 'feature.json'), {
			dependencies: ['ghost'],
			description: 'child work',
			id: 'feature-child',
			status: 'backlog',
			title: 'Child',
		});

		const acc = await runGuard(projectDir);

		expect(acc.pendingCarryoverNotes).toHaveLength(1);
		expect(acc.pendingCarryoverNotes[0]).toContain('does not satisfy its contract');
		expect(acc.pendingCarryoverNotes[0]).toContain('ghost');
	});

	test('stays silent on a clean collection, so a good run carries no nag', async () => {
		const acc = await runGuard(await healthyProject('aidd-contract-clean-'));
		expect(acc.pendingCarryoverNotes).toEqual([]);
	});

	// Audit mode leaves a rejected report's audit pending for retry. Without the reasons the
	// retry is a blind re-roll of the same report, which is what maxIterations was buying before.
	test('hands the next iteration the reasons its audit reports were rejected', async () => {
		const acc = accumulator();
		const withRejections = {
			...finalize(),
			modeResult: {
				artifacts: {
					invalidAuditReports: [
						{
							auditName: 'REFACTOR',
							index: 0,
							reason: 'invalid auditFindings: no justification',
						},
					],
				},
			},
		} as unknown as FinalizeIterationResult;

		const exit = await endRunIfIterationGuardTripped({
			acc,
			deps: {
				store: new FileAiddStore(await healthyProject('aidd-audit-rejected-')),
			} as unknown as OrchestratorDeps,
			featureSnapshotBefore: emptySnapshot(),
			finalize: withRejections,
			move: () => undefined,
			plan: {} as never,
			wallClockTimedOut: false,
			work: { kind: 'directive' } as never,
		});

		// Advisory, like the contract check: the agent is the one who can fix the report.
		expect(exit).toBeUndefined();
		expect(acc.pendingCarryoverNotes).toHaveLength(1);
		expect(acc.pendingCarryoverNotes[0]).toContain('REFACTOR');
		expect(acc.pendingCarryoverNotes[0]).toContain('no justification');
	});

	// Metadata bookkeeping must never be what ends an otherwise good iteration.
	test('fails soft when validation throws', async () => {
		const acc = accumulator();
		const exit = await endRunIfIterationGuardTripped({
			acc,
			deps: { store: {} } as unknown as OrchestratorDeps,
			featureSnapshotBefore: emptySnapshot(),
			finalize: finalize(),
			move: () => undefined,
			plan: {} as never,
			wallClockTimedOut: false,
			work: { kind: 'directive' } as never,
		});

		expect(exit).toBeUndefined();
		expect(acc.pendingCarryoverNotes).toEqual([]);
	});
});
