import { afterEach, describe, expect, test } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentEvent } from 'aidd-shared/backends/types';
import type { ResolvedConfig } from 'aidd-shared/config';
import { exitCodeFromEvents, orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { parseArgs } from 'aidd-shared/args/index';
import { type RunFinalSummary, runOrchestrator } from '../../cli/src/orchestrator/orchestrator.ts';
import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';
import type { OrchestratorState } from '../../cli/src/orchestrator/state.ts';
import { InvalidTransitionError, transition } from '../../cli/src/orchestrator/transitions.ts';

import {
	addFeature,
	captureStdout,
	completeFeature,
	config,
	createOrchestratorTestContext,
	FakeBackend,
	HangingAfterMarkerBackend,
	plan,
	rootDir,
	SequencedBackend,
	slowOrchestratorTestTimeoutMs,
} from './_helpers/orchestrator-fixture.ts';

const { cleanup, makeStore } = createOrchestratorTestContext('core');

afterEach(cleanup);

describe('orchestrator transitions and exit mapping', () => {
	// These cases drive a FakeBackend that reports a made-up pid, so the reaper attaches to it and
	// pays for the native process-table probe (~180ms; see processTable.ts). Keep reaping enabled so
	// environment overrides cannot leak into other test files.
	test('rejects invalid transitions', () => {
		expect(() =>
			transition(
				{ type: 'planning' },
				{
					type: 'run_agent',
					plan: plan('.'),
					prompt: { text: '', fragments: [], snapshotKey: '' },
				},
			),
		).toThrow(InvalidTransitionError);
	});

	test('maps normalized error events to stable exit codes', () => {
		expect(exitCodeFromEvents([{ type: 'error', reason: 'idle' }])).toBe(
			orchestratorExitCodes.idleTimeout,
		);
		expect(exitCodeFromEvents([{ type: 'rate_limit', raw: 'limit' }])).toBe(
			orchestratorExitCodes.rateLimited,
		);
		expect(exitCodeFromEvents([{ type: 'error', reason: 'provider' }])).toBe(
			orchestratorExitCodes.providerError,
		);
	});

	test('lets a final successful done event override stale rate-limit text', () => {
		expect(
			exitCodeFromEvents([
				{ type: 'rate_limit', raw: 'transient provider page text' },
				{ type: 'done', exitCode: 0, filesModified: [] },
			]),
		).toBe(orchestratorExitCodes.success);
	});

	test('lets a final successful done event override explicitly nonfatal provider diagnostics', () => {
		expect(
			exitCodeFromEvents([
				{ fatal: false, reason: 'provider', type: 'error' },
				{ type: 'done', exitCode: 0, filesModified: [] },
			]),
		).toBe(orchestratorExitCodes.success);
		expect(
			exitCodeFromEvents([
				{ type: 'rate_limit', raw: 'advisory limit text' },
				{ fatal: false, reason: 'rate_limit', type: 'error' },
				{ type: 'done', exitCode: 0, filesModified: [] },
			]),
		).toBe(orchestratorExitCodes.success);
	});

	test('does not let a final successful done event override fatal provider errors', () => {
		expect(
			exitCodeFromEvents([
				{ fatal: true, reason: 'provider', type: 'error' },
				{ type: 'done', exitCode: 0, filesModified: [] },
			]),
		).toBe(orchestratorExitCodes.providerError);
		expect(
			exitCodeFromEvents([
				{ reason: 'provider', type: 'error' },
				{ type: 'done', exitCode: 0, filesModified: [] },
			]),
		).toBe(orchestratorExitCodes.providerError);
	});

	test('finalizes successful pre-run artifact checks for active-run observers', async () => {
		const store = await makeStore('check-artifacts-final-summary');
		await writeFile(join(store.projectDir, 'CONTEXT.md'), 'Context\n');
		await writeFile(join(store.metadataDir, 'spec.md'), 'Spec\n');
		let finalSummary: RunFinalSummary | undefined;

		const exitCode = await runOrchestrator(plan(store.projectDir, ['--check-artifacts']), {
			backend: new FakeBackend([]),
			observer: {
				onFinalSummary: (summary) => {
					finalSummary = summary;
				},
			},
			rootDir,
			runId: 'run_check_artifacts_success',
			store,
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(finalSummary).toMatchObject({
			exitCode: orchestratorExitCodes.success,
			runId: 'run_check_artifacts_success',
			stopReason: 'completed',
		});
		expect(finalSummary?.summary).toStartWith('artifact check passed:');
		expect(finalSummary?.totals.errors).toBe(0);
		// Pre-run checks now append a ledger line so the web layer's phantom reconciler
		// keeps validate runs in Recent Runs.
		const ledger = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
		const entry = JSON.parse(ledger.trim().split('\n').at(-1) ?? '{}') as {
			runId: string;
			stopReason: string;
			summary: string;
		};
		expect(entry.runId).toBe('run_check_artifacts_success');
		expect(entry.stopReason).toBe('completed');
		expect(entry.summary).toStartWith('artifact check passed:');
	});

	test('a failed artifact check reports the missing artifacts in summary and run log', async () => {
		const store = await makeStore('check-artifacts-failure');
		// Force the store into a phase where required artifacts are enforced, then omit spec.md.
		await writeFile(join(store.metadataDir, 'project.md'), 'Project\n');
		await writeFile(join(store.metadataDir, 'CHANGELOG.md'), '# Changelog\n');
		const rawLogChunks: string[] = [];
		let finalSummary: RunFinalSummary | undefined;

		const exitCode = await runOrchestrator(plan(store.projectDir, ['--check-artifacts']), {
			backend: new FakeBackend([]),
			observer: {
				onAgentEvent: (event) => {
					if (event.type === 'raw_log') rawLogChunks.push(event.chunk);
				},
				onFinalSummary: (summary) => {
					finalSummary = summary;
				},
			},
			rootDir,
			runId: 'run_check_artifacts_failure',
			store,
		});

		if (exitCode === orchestratorExitCodes.success) {
			// Pre-onboarding projects report missing artifacts as informational; the check can
			// legitimately pass. The log must still carry the table either way.
			expect(finalSummary?.summary).toStartWith('artifact check passed:');
		} else {
			expect(exitCode).toBe(orchestratorExitCodes.validationError);
			expect(finalSummary?.summary).toStartWith('artifact check FAILED:');
			expect(finalSummary?.summary).toContain('.artifacts-check.json');
		}
		// The formatted check output reaches the run log instead of leaving a 0-byte file.
		expect(rawLogChunks.join('')).toContain('Project-Level Assertions Check');
	});

	test('runs success path through observable states and writes iteration artifact', async () => {
		const store = await makeStore('success');
		const states: OrchestratorState['type'][] = [];
		const backend = new FakeBackend(
			[
				{
					type: 'assistant_text',
					chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
				},
				{ type: 'done', exitCode: 0, filesModified: ['x.ts'] },
			],
			() => completeFeature(store, 'feature-core'),
		);
		const exitCode = await runOrchestrator(plan(store.projectDir), {
			rootDir,
			store,
			backend,
			onState: (state) => states.push(state.type),
		});

		expect(exitCode).toBe(0);
		expect(states).toEqual([
			'select_work',
			'compile_prompt',
			'run_agent',
			'process_result',
			'write_artifacts',
			'complete',
		]);
		expect(await readFile(join(store.metadataDir, 'iterations', '001.log'), 'utf8')).toContain(
			'assistant_text',
		);
		const iteration = JSON.parse(
			await readFile(join(store.metadataDir, 'iterations', '001.json'), 'utf8'),
		) as { runId?: unknown };
		const runSummary = JSON.parse(
			(await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8')).trim(),
		) as { runId?: unknown };
		expect(typeof iteration.runId).toBe('string');
		expect(runSummary.runId).toBe(iteration.runId);
		expect(backend.inputs[0]).toMatchObject({
			cwd: store.projectDir,
			reasoningEffort: 'low',
			simulation: false,
		});
	});

	test('a parked worktree merge surfaces a non-success exit in the final summary', async () => {
		const store = await makeStore('parked-merge');
		const backend = new FakeBackend(
			[
				{
					type: 'assistant_text',
					chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
				},
				{ type: 'done', exitCode: 0, filesModified: ['x.ts'] },
			],
			() => completeFeature(store, 'feature-core'),
		);
		let finalSummary: { exitCode: number; stopReason: string } | undefined;
		// Simulate a successful run whose merge-back parks (conflict / dirty live tree).
		const exitCode = await runOrchestrator(plan(store.projectDir), {
			rootDir,
			store,
			backend,
			finalizeWorktree: async () => ({
				evidenceFiles: 0,
				mergeStatus: 'blocked' as const,
				overrideExitCode: orchestratorExitCodes.mergeConflictParked,
			}),
			observer: {
				onFinalSummary: (summary) => {
					finalSummary = { exitCode: summary.exitCode, stopReason: summary.stopReason };
				},
			},
		});

		// The process exit AND the terminal summary (which drives the heartbeat/web row) both
		// reflect the park — nothing reports the pre-merge success.
		expect(exitCode).toBe(orchestratorExitCodes.mergeConflictParked);
		expect(finalSummary?.exitCode).toBe(orchestratorExitCodes.mergeConflictParked);
		expect(finalSummary?.stopReason).toBe('merge_conflict_parked');
	});

	test('a metadata-conflict park surfaces its own stop reason, not merge_conflict_parked', async () => {
		const store = await makeStore('parked-metadata');
		const backend = new FakeBackend(
			[
				{
					type: 'assistant_text',
					chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
				},
				{ type: 'done', exitCode: 0, filesModified: ['x.ts'] },
			],
			() => completeFeature(store, 'feature-core'),
		);
		let finalSummary: { exitCode: number; stopReason: string; summary: string } | undefined;
		// Simulate a run parked by a concurrent canonical .aidd edit (merge withheld).
		const exitCode = await runOrchestrator(plan(store.projectDir), {
			rootDir,
			store,
			backend,
			finalizeWorktree: async () => ({
				evidenceFiles: 0,
				mergeStatus: 'withheld' as const,
				metadataConflict: ['features/feature-core/feature.json'],
				overrideExitCode: orchestratorExitCodes.mergeConflictParked,
			}),
			observer: {
				onFinalSummary: (summary) => {
					finalSummary = {
						exitCode: summary.exitCode,
						stopReason: summary.stopReason,
						summary: summary.summary,
					};
				},
			},
		});

		expect(exitCode).toBe(orchestratorExitCodes.mergeConflictParked);
		expect(finalSummary?.stopReason).toBe('metadata_conflict_parked');
		expect(finalSummary?.summary).toContain('features/feature-core/feature.json');
	});

	test('claims selected feature and writes started artifact before backend launch', async () => {
		const store = await makeStore('started-claim');
		let observedStatus: unknown;
		let observedStartedArtifact:
			| {
					lifecycle?: unknown;
					selectedFeatures?: unknown;
					endedAt?: unknown;
			  }
			| undefined;
		const backend = new FakeBackend(
			[
				{
					type: 'assistant_text',
					chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
				},
				{ type: 'done', exitCode: 0, filesModified: ['x.ts'] },
			],
			async () => {
				observedStatus = (await store.readFeature('feature-core')).status;
				observedStartedArtifact = JSON.parse(
					await readFile(join(store.metadataDir, 'iterations', '001.json'), 'utf8'),
				) as typeof observedStartedArtifact;
				await completeFeature(store, 'feature-core');
			},
		);

		const exitCode = await runOrchestrator(plan(store.projectDir), {
			rootDir,
			store,
			backend,
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(observedStatus).toBe('in_progress');
		expect(observedStartedArtifact).toMatchObject({
			lifecycle: 'started',
			selectedFeatures: ['feature-core'],
			endedAt: null,
		});
	});

	test('notifies observer without changing CLI exit behavior', async () => {
		const store = await makeStore('observer-contract');
		const observerStates: OrchestratorState['type'][] = [];
		const agentEvents: AgentEvent['type'][] = [];
		const modeSummaries: string[] = [];
		const iterations: Record<string, unknown>[] = [];
		const finalSummaries: { exitCode: number; summary: string }[] = [];
		const backend = new FakeBackend(
			[
				{ type: 'started', backend: 'native', pid: 1234 },
				{
					type: 'assistant_text',
					chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
				},
				{ type: 'done', exitCode: 0, filesModified: ['x.ts'] },
			],
			() => completeFeature(store, 'feature-core'),
		);

		const exitCode = await runOrchestrator(plan(store.projectDir), {
			rootDir,
			store,
			backend,
			observer: {
				onAgentEvent: (event) => {
					agentEvents.push(event.type);
				},
				onFinalSummary: (summary) => {
					finalSummaries.push({
						exitCode: summary.exitCode,
						summary: summary.summary,
					});
				},
				onIteration: (artifact) => {
					iterations.push(artifact.structured);
				},
				onModeResult: (result) => {
					modeSummaries.push(result.summary);
				},
				onState: (state) => observerStates.push(state.type),
			},
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(observerStates).toEqual([
			'select_work',
			'compile_prompt',
			'run_agent',
			'process_result',
			'write_artifacts',
			'complete',
		]);
		expect(agentEvents).toEqual(['started', 'assistant_text', 'done']);
		expect(modeSummaries).toEqual(['coding has no incomplete feature work']);
		expect(iterations[0]).toMatchObject({
			lifecycle: 'started',
			selectedFeatures: ['feature-core'],
			summary: 'coding started feature-core',
		});
		expect(iterations[1]).toMatchObject({
			commitsCreatedCount: 0,
			exitCode: 0,
			filesCreatedCount: 0,
			filesEditedCount: 0,
			summary: 'coding has no incomplete feature work',
		});
		expect(typeof iterations[1]?.residualDirtyFilesCount).toBe('number');
		expect(iterations[1]).not.toHaveProperty('filesModified');
		expect(finalSummaries).toEqual([
			{ exitCode: 0, summary: 'coding has no incomplete feature work' },
		]);
	});

	test('accepts completed feature metadata when idle arrives after AIDD_RESULT', async () => {
		const store = await makeStore('idle-after-result');
		const backend = new FakeBackend(
			[
				{
					type: 'assistant_text',
					chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
				},
				{ type: 'error', reason: 'idle', meta: { killMs: 20 } },
			],
			() => completeFeature(store, 'feature-core'),
		);

		const exitCode = await runOrchestrator(plan(store.projectDir), {
			rootDir,
			store,
			backend,
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		await expect(store.readFeature('feature-core')).resolves.toMatchObject({
			status: 'completed',
			passes: true,
		});
		const iterationJson = await readFile(
			join(store.metadataDir, 'iterations', '001.json'),
			'utf8',
		);
		expect(iterationJson).toContain('"exitCode": 0');
		expect(iterationJson).toContain('"status": "success"');
		expect(iterationJson).toContain('"completedFeature": "feature-core"');
		expect(iterationJson).toContain('"completionOutcome": "completed_after_backend_idle"');
		const runs = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
		expect(runs).toContain('"stopReason":"completed"');
		expect(runs).not.toContain('"exitCode":71');
	});

	test('finalizes accepted completion marker when backend stays open', async () => {
		const store = await makeStore('completion-marker-hang');
		const backend = new HangingAfterMarkerBackend(() => completeFeature(store, 'feature-core'));

		const exitCode = await runOrchestrator(plan(store.projectDir), {
			rootDir,
			store,
			backend,
			completionMarkerGraceMs: 10,
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		const iterationJson = await readFile(
			join(store.metadataDir, 'iterations', '001.json'),
			'utf8',
		);
		expect(iterationJson).toContain('"exitCode": 0');
		expect(iterationJson).toContain('"status": "success"');
		expect(iterationJson).toContain('"completedFeature": "feature-core"');
		expect(iterationJson).toContain('"backendCompletionFinalizedEarly": true');
		const runs = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
		expect(runs).toContain('"stopReason":"completed"');
		expect(runs).not.toContain('"stopReason":"stop_requested"');
	});

	test('accepts completed feature metadata when abort arrives after AIDD_RESULT', async () => {
		const store = await makeStore('abort-after-result');
		const backend = new FakeBackend(
			[
				{
					type: 'assistant_text',
					chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
				},
				{ type: 'error', reason: 'aborted', meta: 'stop requested' },
			],
			() => completeFeature(store, 'feature-core'),
		);

		const exitCode = await runOrchestrator(plan(store.projectDir), {
			rootDir,
			store,
			backend,
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		const iterationJson = await readFile(
			join(store.metadataDir, 'iterations', '001.json'),
			'utf8',
		);
		expect(iterationJson).toContain('"exitCode": 0');
		expect(iterationJson).toContain('"status": "success"');
		expect(iterationJson).toContain('"completedFeature": "feature-core"');
		expect(iterationJson).toContain('"completionOutcome": "completed_after_backend_abort"');
		const runs = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
		expect(runs).toContain('"stopReason":"completed"');
		expect(runs).not.toContain('"exitCode":124');
	});

	test('prints iteration start and thinking markers while waiting on backend output', async () => {
		const store = await makeStore('operator-output');
		const backend = new FakeBackend(
			[
				{ type: 'started', backend: 'native', pid: 1234 },
				{ type: 'tool_call', tool: 'bash', args: { command: 'bun run smoke:qc' } },
				{ type: 'idle_warning', afterMs: 60_000 },
				{
					type: 'assistant_text',
					chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
				},
				{ type: 'done', exitCode: 0, filesModified: [] },
			],
			() => completeFeature(store, 'feature-core'),
		);

		const output = await captureStdout(async () => {
			await runOrchestrator(plan(store.projectDir), { rootDir, store, backend });
		});

		expect(output).toContain('aidd iteration 1 starting');
		expect(output).toContain('Backend:    native');
		expect(output).toContain('Work:       feature:feature-core - Core feature');
		expect(output).toContain('[backend] native started pid=1234');
		expect(output).toContain('[thinking] waiting for native output...');
		expect(output).toContain('waiting for backend');
		expect(output).toContain('tool call');
		expect(output).toContain('last tool bash "bun run smoke:qc"');
		expect(output).toContain('idle warning');
		expect(output).toContain('process result');
		expect(output).toContain('write artifacts');
		expect(output).toContain('iteration complete');
		expect(output).toContain(
			'[thinking] still waiting after 1m; logged idle warning (telemetry only).',
		);
	});

	test('forwards model, reasoning effort, and simulation to backend prompt input', async () => {
		const store = await makeStore('runtime-input');
		const backend = new FakeBackend(
			[
				{
					type: 'assistant_text',
					chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
				},
				{ type: 'done', exitCode: 0, filesModified: [] },
			],
			() => completeFeature(store, 'feature-core'),
		);
		const runtimeConfig: ResolvedConfig = {
			...config,
			codeModel: 'code-model',
			reasoningEffort: 'high',
		};
		const runtimePlan = resolveRunPlan(
			parseArgs(['--project-dir', store.projectDir, '--cli', 'native', '--simulation']),
			runtimeConfig,
		);

		await runOrchestrator(runtimePlan, { rootDir, store, backend });

		expect(backend.inputs[0]).toMatchObject({
			model: 'code-model',
			reasoningEffort: 'high',
			simulation: true,
		});
	});

	test('sleeps and retries on rate-limit instead of failing', async () => {
		const store = await makeStore('rate-limit');
		const fastConfig: ResolvedConfig = {
			...config,
			rateLimitBufferSeconds: 0,
			rateLimitBackoffSeconds: 0,
		};
		const runtimePlan = resolveRunPlan(
			parseArgs(['--project-dir', store.projectDir, '--cli', 'native']),
			fastConfig,
		);
		const backend = new SequencedBackend(
			[
				[{ type: 'error', reason: 'rate_limit' }],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
			],
			async (callIndex) => {
				if (callIndex === 1) await completeFeature(store, 'feature-core');
			},
		);
		const exitCode = await runOrchestrator(runtimePlan, { rootDir, store, backend });
		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(backend.calls).toBe(2);
	});

	test('preserves rate-limit classification when the backoff exceeds the run budget', async () => {
		const store = await makeStore('rate-limit-beyond-budget');
		const runtimePlan = resolveRunPlan(
			parseArgs(['--project-dir', store.projectDir, '--cli', 'native']),
			{
				...config,
				rateLimitBackoffSeconds: 300,
				rateLimitBufferSeconds: 0,
				timeoutSeconds: 1,
			},
		);
		const backend = new FakeBackend([{ type: 'error', reason: 'rate_limit' }]);

		const exitCode = await runOrchestrator(runtimePlan, { rootDir, store, backend });

		expect(exitCode).toBe(orchestratorExitCodes.rateLimited);
		const runs = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
		const entry = JSON.parse(runs.trim()) as {
			exitCode: number;
			stopReason: string;
			summary: string;
		};
		expect(entry.exitCode).toBe(orchestratorExitCodes.rateLimited);
		expect(entry.stopReason).toBe('exit_error');
		expect(entry.summary).toContain('rate_limit_wait_exceeds_budget');
		expect(entry.summary).not.toContain('wall_clock_timeout');
	});

	test('honors stop file after current iteration completes', async () => {
		const store = await makeStore('stop-after');
		const runtimePlan = plan(store.projectDir);
		let wroteStop = false;
		const exitCode = await runOrchestrator(runtimePlan, {
			rootDir,
			store,
			backend: new FakeBackend(
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				() => completeFeature(store, 'feature-core'),
			),
			onState: (state) => {
				if (state.type === 'run_agent' && !wroteStop) {
					wroteStop = true;
					void writeFile(runtimePlan.stopPolicy.stopFile, 'stop\n');
				}
			},
		});
		expect(exitCode).toBe(orchestratorExitCodes.success);
		const runs = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
		expect(runs).toContain('"stopReason":"completed"');
		expect(runs).not.toContain('"stopReason":"stop_requested"');
	});

	test('treats a nonzero backend exit after stop request as stop requested', async () => {
		const store = await makeStore('stop-after-nonzero');
		const runtimePlan = plan(store.projectDir);
		let wroteStop = false;
		const exitCode = await runOrchestrator(runtimePlan, {
			rootDir,
			store,
			backend: new FakeBackend([
				{ type: 'error', reason: 'provider', meta: { stderr: '^C', exitCode: 58 } },
				{ type: 'done', exitCode: 58, filesModified: [] },
			]),
			onState: (state) => {
				if (state.type === 'run_agent' && !wroteStop) {
					wroteStop = true;
					void writeFile(runtimePlan.stopPolicy.stopFile, 'stop\n');
				}
			},
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		const runs = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
		expect(runs).toContain('"stopReason":"stop_requested"');
		expect(runs).toContain('backend exit code 72');
	});

	test('honors a custom stop policy file path', async () => {
		const store = await makeStore('custom-stop-file');
		const runtimePlan = plan(store.projectDir);
		runtimePlan.stopPolicy.stopFile = join(store.metadataDir, 'custom.stop');
		await writeFile(runtimePlan.stopPolicy.stopFile, 'stop\n');

		const backend = new FakeBackend([{ type: 'error', reason: 'provider' }]);
		const exitCode = await runOrchestrator(runtimePlan, { rootDir, store, backend });

		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(backend.calls).toBe(0);
	});

	test('blocks backend runs when prompt artifacts are UTF-16', async () => {
		const store = await makeStore('utf16-artifact');
		await writeFile(join(store.metadataDir, 'spec.md'), Buffer.from([0xff, 0xfe, 0x41, 0]));
		const backend = new FakeBackend([{ type: 'error', reason: 'provider' }]);

		const exitCode = await runOrchestrator(plan(store.projectDir), {
			rootDir,
			store,
			backend,
		});

		expect(exitCode).toBe(orchestratorExitCodes.validationError);
		expect(backend.calls).toBe(0);
		const runs = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
		expect(runs).toContain('Prompt artifact encoding check failed');
		expect(runs).toContain('.aidd/spec.md');
	});

	test('director mode bypasses the prompt-artifact encoding gate', async () => {
		// A UTF-16 prompt artifact in the (arbitrary) host project would block a
		// coding run, but must NOT veto a fleet-wide director cycle: director
		// only borrows the project as a cwd and builds its prompt from the fleet
		// summary, not the host's artifacts.
		const store = await makeStore('utf16-director');
		await writeFile(join(store.metadataDir, 'spec.md'), Buffer.from([0xff, 0xfe, 0x41, 0]));
		const fleetSummary = join(store.metadataDir, 'fleet-summary.json');
		const outputPath = join(store.metadataDir, 'director-output.json');
		await writeFile(fleetSummary, JSON.stringify({ projects: [] }));
		const backend = new FakeBackend([{ type: 'error', reason: 'provider' }]);

		const exitCode = await runOrchestrator(
			plan(store.projectDir, [
				'--director',
				'--fleet-summary',
				fleetSummary,
				'--director-output',
				outputPath,
			]),
			{ rootDir, store, backend },
		);

		// Got past preflight: the backend was actually invoked and the run did not
		// short-circuit with the encoding validation error.
		expect(backend.calls).toBeGreaterThan(0);
		expect(exitCode).not.toBe(orchestratorExitCodes.validationError);
		const runs = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8').catch(() => '');
		expect(runs).not.toContain('Prompt artifact encoding check failed');
	});

	test('continues after idle timeout by default', async () => {
		const store = await makeStore('continue-timeout');
		const runtimePlan = plan(store.projectDir);
		const backend = new SequencedBackend(
			[
				[{ type: 'error', reason: 'idle' }],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
			],
			async (callIndex) => {
				if (callIndex === 1) await completeFeature(store, 'feature-core');
			},
		);

		const exitCode = await runOrchestrator(runtimePlan, { rootDir, store, backend });

		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(backend.calls).toBe(2);
		await expect(store.readFeature('feature-core')).resolves.toMatchObject({ passes: true });
	});

	test('continues after idle timeout when max iterations is one', async () => {
		const store = await makeStore('continue-timeout-max-one');
		const limitedPlan = resolveRunPlan(
			parseArgs(['--project-dir', store.projectDir, '--cli', 'native']),
			{ ...config, maxIterations: 1 },
		);
		const backend = new SequencedBackend(
			[
				[{ type: 'error', reason: 'idle' }],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
			],
			async (callIndex) => {
				if (callIndex === 1) await completeFeature(store, 'feature-core');
			},
		);

		const exitCode = await runOrchestrator(limitedPlan, { rootDir, store, backend });

		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(backend.calls).toBe(2);
		await expect(store.readFeature('feature-core')).resolves.toMatchObject({ passes: true });
		const runs = (await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8')).trim();
		expect(runs).toContain('"stopReason":"completed"');
		expect(runs).toContain('"iterations":2');
		expect(runs).not.toContain('"stopReason":"max_iterations"');
	});

	test('continues after provider timeout by default', async () => {
		const store = await makeStore('continue-provider-timeout');
		const runtimePlan = plan(store.projectDir);
		const backend = new SequencedBackend(
			[
				[{ type: 'error', reason: 'provider', meta: 'The operation timed out.' }],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
			],
			async (callIndex) => {
				if (callIndex === 1) await completeFeature(store, 'feature-core');
			},
		);

		const exitCode = await runOrchestrator(runtimePlan, { rootDir, store, backend });

		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(backend.calls).toBe(2);
		const iterationJson = await readFile(
			join(store.metadataDir, 'iterations', '001.json'),
			'utf8',
		);
		expect(iterationJson).toContain('"status": "provider_error"');
		await expect(store.readFeature('feature-core')).resolves.toMatchObject({ passes: true });
	});

	test('continues after transient provider timeout when max iterations is one', async () => {
		const store = await makeStore('continue-provider-timeout-max-one');
		const limitedPlan = resolveRunPlan(
			parseArgs(['--project-dir', store.projectDir, '--cli', 'native']),
			{ ...config, maxIterations: 1 },
		);
		const backend = new SequencedBackend(
			[
				[{ type: 'error', reason: 'provider', meta: 'The operation timed out.' }],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
			],
			async (callIndex) => {
				if (callIndex === 1) await completeFeature(store, 'feature-core');
			},
		);

		const exitCode = await runOrchestrator(limitedPlan, { rootDir, store, backend });

		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(backend.calls).toBe(2);
		await expect(store.readFeature('feature-core')).resolves.toMatchObject({ passes: true });
		const runs = (await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8')).trim();
		expect(runs).toContain('"stopReason":"completed"');
		expect(runs).toContain('"iterations":2');
		expect(runs).not.toContain('"stopReason":"max_iterations"');
	});

	test('continues after transient provider errors by default', async () => {
		const store = await makeStore('continue-transient-provider-error');
		const runtimePlan = plan(store.projectDir);
		const backend = new SequencedBackend(
			[
				[
					{
						type: 'error',
						reason: 'provider',
						meta: 'zhipu request failed: HTTP 500 {"error":{"code":"1234","message":"Network error, please try again later"}}',
					},
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
			],
			async (callIndex) => {
				if (callIndex === 1) await completeFeature(store, 'feature-core');
			},
		);

		const exitCode = await runOrchestrator(runtimePlan, { rootDir, store, backend });

		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(backend.calls).toBe(2);
		const iterationJson = await readFile(
			join(store.metadataDir, 'iterations', '001.json'),
			'utf8',
		);
		expect(iterationJson).toContain('"status": "provider_error"');
		await expect(store.readFeature('feature-core')).resolves.toMatchObject({ passes: true });
	});

	test('stops after repeated continuable interruptions reach the retry guard', async () => {
		const store = await makeStore('continue-timeout-retry-limit');
		const limitedPlan = resolveRunPlan(
			parseArgs(['--project-dir', store.projectDir, '--cli', 'native']),
			{ ...config, maxIterations: 1 },
		);
		const backend = new SequencedBackend([
			[{ type: 'error', reason: 'idle' }],
			[{ type: 'error', reason: 'idle' }],
		]);

		const exitCode = await runOrchestrator(limitedPlan, { rootDir, store, backend });

		expect(exitCode).toBe(orchestratorExitCodes.idleTimeout);
		expect(backend.calls).toBe(2);
		await expect(store.readFeature('feature-core')).resolves.toMatchObject({ passes: false });
		const runs = (await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8')).trim();
		expect(runs).toContain('"stopReason":"exit_error"');
		expect(runs).toContain('"iterations":2');
		expect(runs).toContain('continuable backend interruption retry limit reached (1)');
		expect(runs).not.toContain('"stopReason":"max_iterations"');
	});

	test('stops after non-timeout provider errors by default', async () => {
		const store = await makeStore('continue-provider-non-timeout');
		const runtimePlan = plan(store.projectDir);
		const backend = new SequencedBackend([
			[{ type: 'error', reason: 'provider', meta: 'HTTP 401 invalid API key.' }],
			[
				{
					type: 'assistant_text',
					chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
				},
				{ type: 'done', exitCode: 0, filesModified: [] },
			],
		]);

		const exitCode = await runOrchestrator(runtimePlan, { rootDir, store, backend });

		expect(exitCode).toBe(orchestratorExitCodes.providerError);
		expect(backend.calls).toBe(1);
		await expect(store.readFeature('feature-core')).resolves.toMatchObject({ passes: false });
	});

	test('stops after provider timeout when continueOnTimeout is disabled', async () => {
		const store = await makeStore('disable-provider-timeout-continuation');
		const runtimePlan = plan(store.projectDir, ['--no-continue-on-timeout']);
		const backend = new SequencedBackend([
			[{ type: 'error', reason: 'provider', meta: 'The operation timed out.' }],
			[
				{
					type: 'assistant_text',
					chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
				},
				{ type: 'done', exitCode: 0, filesModified: [] },
			],
		]);

		const exitCode = await runOrchestrator(runtimePlan, { rootDir, store, backend });

		expect(exitCode).toBe(orchestratorExitCodes.providerError);
		expect(backend.calls).toBe(1);
		await expect(store.readFeature('feature-core')).resolves.toMatchObject({ passes: false });
	});

	test('records verification lifecycle conflict evidence before idle exit', async () => {
		const store = await makeStore('verification-lifecycle-conflict');
		const backend = new FakeBackend([
			{ type: 'tool_call', tool: 'bash', args: { command: 'bun run smoke:dev' } },
			{
				type: 'tool_call',
				tool: 'bash',
				args: { command: 'bun scripts/crawltest.ts --page /' },
			},
			{ type: 'idle_warning', afterMs: 60_000 },
			{ type: 'error', reason: 'idle', meta: { killMs: 90_000 } },
		]);

		const exitCode = await runOrchestrator(
			plan(store.projectDir, ['--no-continue-on-timeout']),
			{
				rootDir,
				store,
				backend,
			},
		);

		expect(exitCode).toBe(orchestratorExitCodes.idleTimeout);
		const iterationJson = await readFile(
			join(store.metadataDir, 'iterations', '001.json'),
			'utf8',
		);
		expect(iterationJson).toContain('"exitCode": 71');
		expect(iterationJson).toContain(
			'verification_lifecycle_conflict: bun run smoke:dev | bun scripts/crawltest.ts --page /',
		);
		expect(iterationJson).toContain('"status": "verification_lifecycle_conflict"');
		expect(iterationJson).toContain('"failurePhase": "verification"');
		expect(iterationJson).toContain('"reason": "server_lifecycle_conflict"');
		expect(iterationJson).toContain('bun run smoke:dev');
		expect(iterationJson).toContain('bun scripts/crawltest.ts --page /');
		const runs = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
		expect(runs).toContain('verification_lifecycle_conflict');
		expect(runs).toContain('"exitCode":71');
	});

	test('records active verification timeout evidence before idle exit', async () => {
		const store = await makeStore('active-verification-timeout');
		const backend = new FakeBackend([
			{
				type: 'assistant_text',
				chunk: 'Starting long verification: `bun run smoke:dev` and focused browser checks.',
			},
			{ type: 'idle_warning', afterMs: 60_000 },
			{ type: 'error', reason: 'idle', meta: { killMs: 90_000 } },
		]);

		const exitCode = await runOrchestrator(
			plan(store.projectDir, ['--no-continue-on-timeout']),
			{
				rootDir,
				store,
				backend,
			},
		);

		expect(exitCode).toBe(orchestratorExitCodes.idleTimeout);
		const iterationJson = await readFile(
			join(store.metadataDir, 'iterations', '001.json'),
			'utf8',
		);
		expect(iterationJson).toContain('"exitCode": 71');
		expect(iterationJson).toContain('active_verification_timeout: bun run smoke:dev');
		expect(iterationJson).toContain('"status": "active_verification_timeout"');
		expect(iterationJson).toContain('"reason": "silent_during_active_verification"');
		expect(iterationJson).toContain('Starting long verification');
		const runs = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
		expect(runs).toContain('active_verification_timeout');
		expect(runs).toContain('"exitCode":71');
	});

	test('recovers active verification timeout after targeted checks passed', async () => {
		const store = await makeStore('active-verification-recovery');
		const backend = new FakeBackend([
			{
				type: 'assistant_text',
				chunk: 'Targeted route checks passed with zero console errors.',
			},
			{
				type: 'assistant_text',
				chunk: 'Starting broad lifecycle verification: `bun run smoke:dev`.',
			},
			{ type: 'idle_warning', afterMs: 60_000 },
			{ type: 'error', reason: 'idle', meta: { killMs: 90_000 } },
		]);

		const exitCode = await runOrchestrator(plan(store.projectDir), {
			rootDir,
			store,
			backend,
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		await expect(store.readFeature('feature-core')).resolves.toMatchObject({
			status: 'waiting_approval',
			passes: false,
		});
		const iterationJson = await readFile(
			join(store.metadataDir, 'iterations', '001.json'),
			'utf8',
		);
		expect(iterationJson).toContain('"exitCode": 71');
		expect(iterationJson).toContain('"status": "active_verification_recovery"');
		expect(iterationJson).toContain('"decision": "waiting_approval"');
		expect(iterationJson).toContain('Targeted route checks passed');
		expect(iterationJson).toContain('bun run smoke:dev');
		const runs = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
		expect(runs).toContain('"stopReason":"blocked"');
		expect(runs).toContain('"exitCode":0');
		expect(runs).toContain('active_verification_recovery: bun run smoke:dev');
	});

	test('records active verification timeout from command start evidence', async () => {
		const store = await makeStore('active-command-timeout');
		const backend = new FakeBackend([
			{ type: 'tool_call', tool: 'bash', args: { command: 'bun run smoke:dev' } },
			{ type: 'idle_warning', afterMs: 60_000 },
			{ type: 'error', reason: 'idle', meta: { killMs: 90_000 } },
		]);

		const exitCode = await runOrchestrator(
			plan(store.projectDir, ['--no-continue-on-timeout']),
			{
				rootDir,
				store,
				backend,
			},
		);

		expect(exitCode).toBe(orchestratorExitCodes.idleTimeout);
		const iterationJson = await readFile(
			join(store.metadataDir, 'iterations', '001.json'),
			'utf8',
		);
		expect(iterationJson).toContain('"status": "active_verification_timeout"');
		const structured = JSON.parse(iterationJson) as {
			outcome: { activeVerificationTimeout?: { commands: string[] } };
		};
		expect(structured.outcome.activeVerificationTimeout?.commands).toEqual([
			'bun run smoke:dev',
		]);
		const runs = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
		expect(runs).toContain('active_verification_timeout: bun run smoke:dev');
	});

	test('exits after configured consecutive aborts', async () => {
		const store = await makeStore('quit-on-abort');
		const runtimePlan = resolveRunPlan(
			parseArgs(['--project-dir', store.projectDir, '--cli', 'native']),
			{ ...config, quitOnAbort: 2 },
		);
		const backend = new SequencedBackend([
			[{ type: 'error', reason: 'aborted', meta: 'first' }],
			[{ type: 'error', reason: 'aborted', meta: 'second' }],
		]);

		const exitCode = await runOrchestrator(runtimePlan, { rootDir, store, backend });

		expect(exitCode).toBe(orchestratorExitCodes.aborted);
		expect(backend.calls).toBe(2);
	});

	test('stopWhenDone exits after one completed feature', async () => {
		const store = await makeStore('stop-when-done');
		await addFeature(store, 'feature-second', 2);
		const backend = new SequencedBackend(
			[
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"featureId":"feature-second","status":"completed","passes":true}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
			],
			(callIndex) => {
				if (callIndex === 0) return completeFeature(store, 'feature-core');
				return completeFeature(store, 'feature-second');
			},
		);

		const exitCode = await runOrchestrator(plan(store.projectDir, ['--stop-when-done']), {
			rootDir,
			store,
			backend,
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(backend.calls).toBe(1);
		await expect(store.readFeature('feature-second')).resolves.toMatchObject({ passes: false });
	});

	test('loops coding work until mode completes', async () => {
		const store = await makeStore('loop-complete');
		await addFeature(store, 'feature-second', 2);
		const backend = new SequencedBackend(
			[
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"featureId":"feature-second","status":"completed","passes":true}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
			],
			(callIndex) => {
				if (callIndex === 0) return completeFeature(store, 'feature-core');
				return completeFeature(store, 'feature-second');
			},
		);

		const exitCode = await runOrchestrator(plan(store.projectDir), {
			rootDir,
			store,
			backend,
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(backend.calls).toBe(2);
		await expect(store.readFeature('feature-core')).resolves.toMatchObject({ passes: true });
		await expect(store.readFeature('feature-second')).resolves.toMatchObject({ passes: true });
		await expect(
			readFile(join(store.metadataDir, 'iterations', '002.json'), 'utf8'),
		).resolves.toContain('feature-second');
	});

	test(
		'stops looping after max iterations',
		async () => {
			const store = await makeStore('max-iterations');
			await addFeature(store, 'feature-second', 2);
			const limitedConfig = { ...config, maxIterations: 1 };
			const limitedPlan = resolveRunPlan(
				parseArgs(['--project-dir', store.projectDir, '--cli', 'native']),
				limitedConfig,
			);
			const backend = new FakeBackend([
				{
					type: 'assistant_text',
					chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
				},
				{ type: 'done', exitCode: 0, filesModified: [] },
			]);

			const exitCode = await runOrchestrator(limitedPlan, { rootDir, store, backend });

			expect(exitCode).toBe(orchestratorExitCodes.success);
			expect(backend.calls).toBe(1);
			await expect(store.readFeature('feature-core')).resolves.toMatchObject({
				passes: false,
			});
			await expect(store.readFeature('feature-second')).resolves.toMatchObject({
				passes: false,
			});
			const structured = await readFile(
				join(store.metadataDir, 'iterations', '001.json'),
				'utf8',
			);
			expect(structured).toContain('"iteration": 0');
			expect(structured).toContain('completionMarkerIgnored');
		},
		slowOrchestratorTestTimeoutMs,
	);
});
