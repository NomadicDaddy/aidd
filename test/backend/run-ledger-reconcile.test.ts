import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { dropLedgerPhantomRuns } from '../../backend/src/services/run/ledgerReconcile.ts';
import type { RunRecord } from '../../backend/src/types.ts';

import { testTempDir } from '../_helpers/temp.ts';
function makeRun(overrides: { id: string; projectPath: string } & Partial<RunRecord>): RunRecord {
	return {
		activityState: null,
		aiddDirty: null,
		aiddRevision: null,
		aiddVersion: null,
		aiSummary: null,
		backend: 'native',
		canKill: false,
		canReadOutput: false,
		canStop: false,
		chainedFromRunId: null,
		completedAt: 1_000,
		continuationReason: null,
		durationMs: 1_000,
		errorMessage: null,
		exitCode: 0,
		heartbeatAt: null,
		launchCommand: null,
		logPath: null,
		mode: 'coding',
		model: null,
		pid: null,
		pipelineSessionId: null,
		projectId: 'proj',
		projectName: 'proj',
		provider: null,
		reasoningEffort: null,
		source: 'web',
		startedAt: 1_000,
		status: 'completed',
		stopReason: null,
		stopRequested: false,
		summary: null,
		...overrides,
	};
}

async function writeLedger(projectDir: string, runIds: string[]): Promise<void> {
	const metadataDir = join(projectDir, '.aidd');
	await mkdir(metadataDir, { recursive: true });
	const lines = runIds.map((runId) => JSON.stringify({ runId, exitCode: 0 }));
	await writeFile(join(metadataDir, 'runs.jsonl'), `${lines.join('\n')}\n`);
}

describe('dropLedgerPhantomRuns', () => {
	test('drops a supervisor-reconciled run absent from a populated ledger with no active-runs record', async () => {
		const projectDir = await testTempDir('aidd-ledger-reconcile-');
		try {
			await writeLedger(projectDir, ['run-real']);
			const items = [
				makeRun({ id: 'run-real', projectPath: projectDir }),
				// exitCode -1 is the RECONCILED_EXIT_CODE sentinel every force-fail path stamps —
				// the positive evidence required before a row may be treated as a phantom.
				makeRun({
					id: 'run-phantom',
					projectPath: projectDir,
					status: 'failed',
					exitCode: -1,
				}),
			];
			const result = await dropLedgerPhantomRuns(items);
			expect(result.map((run) => run.id)).toEqual(['run-real']);
		} finally {
			await rm(projectDir, { force: true, recursive: true });
		}
	});

	test('keeps a genuine terminal run whose ledger append failed (real exit code)', async () => {
		const projectDir = await testTempDir('aidd-ledger-reconcile-real-');
		try {
			await writeLedger(projectDir, ['run-real']);
			const items = [
				makeRun({ id: 'run-real', projectPath: projectDir }),
				// Absent from the ledger but carrying a real exit code: ledger omissions do not
				// prove a row is synthetic (the append itself can fail), so this must survive.
				makeRun({
					id: 'run-ledger-append-failed',
					projectPath: projectDir,
					status: 'failed',
					exitCode: 1,
				}),
			];
			const result = await dropLedgerPhantomRuns(items);
			expect(result.map((run) => run.id).sort()).toEqual([
				'run-ledger-append-failed',
				'run-real',
			]);
		} finally {
			await rm(projectDir, { force: true, recursive: true });
		}
	});

	test('keeps a running run even when absent from the ledger', async () => {
		const projectDir = await testTempDir('aidd-ledger-reconcile-running-');
		try {
			await writeLedger(projectDir, ['run-real']);
			const items = [
				makeRun({ id: 'run-real', projectPath: projectDir }),
				makeRun({ id: 'run-live', projectPath: projectDir, status: 'running' }),
			];
			const result = await dropLedgerPhantomRuns(items);
			expect(result.map((run) => run.id).sort()).toEqual(['run-live', 'run-real']);
		} finally {
			await rm(projectDir, { force: true, recursive: true });
		}
	});

	test('drops a sentinel-coded run whose stop reason proves it was never observed alive', async () => {
		const projectDir = await testTempDir('aidd-ledger-reconcile-unobserved-');
		try {
			await writeLedger(projectDir, ['run-real']);
			const items = [
				makeRun({ id: 'run-real', projectPath: projectDir }),
				makeRun({
					id: 'run-no-heartbeat',
					projectPath: projectDir,
					status: 'failed',
					exitCode: -1,
					stopReason: 'heartbeat_missing',
				}),
				makeRun({
					id: 'run-died-early',
					projectPath: projectDir,
					status: 'failed',
					exitCode: -1,
					stopReason: 'process_exit',
				}),
			];
			const result = await dropLedgerPhantomRuns(items);
			expect(result.map((run) => run.id)).toEqual(['run-real']);
		} finally {
			await rm(projectDir, { force: true, recursive: true });
		}
	});

	// Regression: a run that worked for 42 minutes and then had its heartbeat go stale carries the
	// same sentinel exit code as a phantom and never appends its ledger line — dying is what stops
	// the append. It must survive, or real history disappears from the list while its detail route
	// still serves the deep link.
	test('keeps sentinel-coded runs whose stop reason proves a live process existed', async () => {
		const projectDir = await testTempDir('aidd-ledger-reconcile-observed-');
		try {
			await writeLedger(projectDir, ['run-real']);
			const observed = ['heartbeat_stale', 'heartbeat_removed', 'killed', 'stop_requested'];
			const items = [
				makeRun({ id: 'run-real', projectPath: projectDir }),
				...observed.map((stopReason) =>
					makeRun({
						id: `run-${stopReason}`,
						projectPath: projectDir,
						status: 'failed',
						exitCode: -1,
						stopReason,
					}),
				),
			];
			const result = await dropLedgerPhantomRuns(items);
			expect(result.map((run) => run.id).sort()).toEqual(
				['run-real', ...observed.map((reason) => `run-${reason}`)].sort(),
			);
		} finally {
			await rm(projectDir, { force: true, recursive: true });
		}
	});

	test('keeps every run when the project has no ledger to reconcile against', async () => {
		const projectDir = await testTempDir('aidd-ledger-reconcile-noledger-');
		try {
			const items = [
				makeRun({ id: 'run-a', projectPath: projectDir }),
				makeRun({ id: 'run-b', projectPath: projectDir, status: 'failed', exitCode: -1 }),
			];
			const result = await dropLedgerPhantomRuns(items);
			expect(result.map((run) => run.id).sort()).toEqual(['run-a', 'run-b']);
		} finally {
			await rm(projectDir, { force: true, recursive: true });
		}
	});
});

describe('validate-run exemption', () => {
	test('keeps a terminal validate run absent from a populated ledger', async () => {
		const projectDir = await testTempDir('aidd-ledger-validate-');
		try {
			await writeLedger(projectDir, ['run-real']);
			const items = [
				makeRun({ id: 'run-real', projectPath: projectDir }),
				// Historical --check-artifacts runs finalized via the heartbeat only and never
				// wrote a ledger line; they must not be dropped as phantoms.
				makeRun({
					id: 'run-validate',
					projectPath: projectDir,
					mode: 'validate',
					status: 'failed',
					exitCode: 1,
				}),
			];
			const kept = await dropLedgerPhantomRuns(items);
			expect(kept.map((run) => run.id).sort()).toEqual(['run-real', 'run-validate']);
		} finally {
			await rm(projectDir, { force: true, recursive: true });
		}
	});
});

describe('readLedgerTerminalEntries', () => {
	test('returns terminal facts per runId with last entry winning', async () => {
		const { readLedgerTerminalEntries } =
			await import('../../backend/src/services/run/ledgerReconcile.ts');
		const projectDir = await testTempDir('aidd-ledger-entries-');
		try {
			const metadataDir = join(projectDir, '.aidd');
			await mkdir(metadataDir, { recursive: true });
			const lines = [
				JSON.stringify({ exitCode: 1, runId: 'run-a', stopReason: 'exit_error' }),
				// Crash-fallback line for run-b precedes the real summary.
				JSON.stringify({ exitCode: null, runId: 'run-b', stopReason: null }),
				JSON.stringify({
					durationMs: 1234,
					exitCode: 130,
					runId: 'run-b',
					stopReason: 'stop_requested',
					summary: 'stopped by user',
				}),
				'not json',
			];
			await writeFile(join(metadataDir, 'runs.jsonl'), `${lines.join('\n')}\n`);
			const entries = await readLedgerTerminalEntries(projectDir);
			expect(entries.get('run-a')).toEqual({
				completedFeatures: null,
				durationMs: null,
				exitCode: 1,
				phase: null,
				selectedFeatures: null,
				stopReason: 'exit_error',
				summary: null,
			});
			expect(entries.get('run-b')).toEqual({
				completedFeatures: null,
				durationMs: 1234,
				exitCode: 130,
				phase: null,
				selectedFeatures: null,
				stopReason: 'stop_requested',
				summary: 'stopped by user',
			});
		} finally {
			await rm(projectDir, { force: true, recursive: true });
		}
	});
});
