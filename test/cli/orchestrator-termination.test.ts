import { afterEach, describe, expect, test } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'aidd-shared/args/index';
import type { AgentEvent, CLIBackend, PromptInput } from 'aidd-shared/backends/types';
import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';

import { runOrchestrator } from '../../cli/src/orchestrator/orchestrator.ts';
import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';
import {
	completeFeature,
	config,
	createOrchestratorTestContext,
	FakeBackend,
	gitHeavyPlan,
	initializeGitProject,
	plan,
	rootDir,
	runGit,
	slowOrchestratorTestTimeoutMs,
} from './_helpers/orchestrator-fixture.ts';

const { cleanup, makeStore } = createOrchestratorTestContext('termination');

afterEach(cleanup);

describe('wall-clock timeout classification', () => {
	class CompleteThenHangBackend implements CLIBackend {
		readonly name = 'native' as const;
		readonly idleDefaults = { nudgeMs: 60_000, killMs: 120_000 };
		private readonly onRun: () => Promise<void>;

		constructor(onRun: () => Promise<void>) {
			this.onRun = onRun;
		}

		async *runPrompt(_input: PromptInput, signal: AbortSignal): AsyncIterable<AgentEvent> {
			// Flip the feature file to completed+passing WITHOUT emitting an accepted
			// AIDD_RESULT marker, then hang until the wall-clock abort — the exact state the
			// deeper runs died in (killed mid-completion, marker never accepted).
			await this.onRun();
			yield { type: 'assistant_text', chunk: 'working on it…\n' };
			await new Promise<void>((resolve) => {
				if (signal.aborted) {
					resolve();
					return;
				}
				signal.addEventListener('abort', () => resolve(), { once: true });
			});
		}
	}

	test(
		'a timed-out run ledgers as aborted (124), not completion-marker blocked (7)',
		async () => {
			const store = await makeStore('wall-clock-timeout');
			const backend = new CompleteThenHangBackend(() =>
				completeFeature(store, 'feature-core'),
			);
			const runtimePlan = resolveRunPlan(
				parseArgs(['--project-dir', store.projectDir, '--cli', 'native']),
				{
					...config,
					idleTimeoutSeconds: 30,
					idleNudgeTimeoutSeconds: 30,
					timeoutSeconds: 1,
				},
			);

			const exitCode = await runOrchestrator(runtimePlan, {
				backend,
				rootDir,
				store,
			});

			expect(exitCode).toBe(orchestratorExitCodes.aborted);
			const runs = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
			const entry = JSON.parse(runs.trim().split('\n').at(-1) ?? '{}') as {
				backendExitCode: null | number;
				exitCode: number;
				stopReason: string;
				summary: string;
			};
			expect(entry.exitCode).toBe(orchestratorExitCodes.aborted);
			expect(entry.stopReason).toBe('exit_error');
			expect(entry.summary).toContain('wall_clock_timeout');
			expect(entry.summary).not.toContain('completion_marker_missing_or_unaccepted');
			expect(typeof entry.backendExitCode).toBe('number');
		},
		slowOrchestratorTestTimeoutMs,
	);

	test('a clean backend exit reclassified as missing result carries the classification in summaries', async () => {
		const store = await makeStore('missing-result-summary');
		// Backend exits 0 with no AIDD_RESULT, no commits, no completion — classification
		// records 73. The recorded summary must lead with that classification instead of
		// reading as a bare "finished with exit code 0" success.
		const backend = new FakeBackend([
			{ type: 'assistant_text', chunk: 'looked around but never emitted a result\n' },
			{ type: 'done', exitCode: 0, filesModified: [] },
		]);

		const exitCode = await runOrchestrator(plan(store.projectDir), { backend, rootDir, store });

		expect(exitCode).toBe(orchestratorExitCodes.missingResult);
		const iteration = JSON.parse(
			await readFile(join(store.metadataDir, 'iterations', '001.json'), 'utf8'),
		) as { exitCode: number; summary: string };
		expect(iteration.exitCode).toBe(orchestratorExitCodes.missingResult);
		expect(iteration.summary).toContain('no AIDD_RESULT emitted [backend exit 0]');
		const runs = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
		expect(runs).toContain('no AIDD_RESULT emitted [backend exit 0]');
		// The ledger's backendExitCode is the RAW backend exit (0 here), matching the
		// bracketed summary — the classified 73 lives in exitCode.
		const entry = JSON.parse(runs.trim().split('\n').at(-1) ?? '{}') as {
			backendExitCode: null | number;
			exitCode: number;
		};
		expect(entry.backendExitCode).toBe(0);
		expect(entry.exitCode).toBe(orchestratorExitCodes.missingResult);
	});

	test('interview generation misses retry with escalation and end the run as flailing', async () => {
		const store = await makeStore('interview-generation-flailing');
		// Every attempt exits cleanly but never creates the questions file — the exact shape
		// of the observed 30-iteration loop. The mode must retry twice with an escalated
		// directive, then end the run as flailing instead of looping to max iterations.
		const backend = new FakeBackend([
			{ type: 'assistant_text', chunk: 'analyzed the project but wrote no questions\n' },
			{ type: 'done', exitCode: 0, filesModified: [] },
		]);

		const exitCode = await runOrchestrator(plan(store.projectDir, ['--interview']), {
			backend,
			rootDir,
			store,
		});

		expect(exitCode).toBe(orchestratorExitCodes.flailing);
		expect(backend.calls).toBe(3);
		expect(backend.inputs[1]?.text).toContain('RETRY 2');
		expect(backend.inputs[2]?.text).toContain('RETRY 3');
		const runs = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
		const entry = JSON.parse(runs.trim().split('\n').at(-1) ?? '{}') as {
			exitCode: number;
			stopReason: string;
			summary: string;
		};
		expect(entry.exitCode).toBe(orchestratorExitCodes.flailing);
		expect(entry.stopReason).toBe('flailing');
		expect(entry.summary).toContain('not created after 3 attempt(s)');
	});

	test('re-entering the loop past the deadline ends the run before spawning a backend', async () => {
		const store = await makeStore('wall-clock-loop-guard');
		const backend = new FakeBackend([]);
		// Deadline == run start, so the loop-top guard must fire before any work is
		// claimed or a backend spawned (the path a rate-limit backoff re-enters through).
		const runtimePlan = resolveRunPlan(
			parseArgs(['--project-dir', store.projectDir, '--cli', 'native']),
			{ ...config, timeoutSeconds: 0 },
		);

		const exitCode = await runOrchestrator(runtimePlan, { backend, rootDir, store });

		expect(exitCode).toBe(orchestratorExitCodes.aborted);
		expect(backend.calls).toBe(0);
		const runs = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
		const entry = JSON.parse(runs.trim().split('\n').at(-1) ?? '{}') as {
			exitCode: number;
			stopReason: string;
			summary: string;
		};
		expect(entry.exitCode).toBe(orchestratorExitCodes.aborted);
		expect(entry.stopReason).toBe('exit_error');
		expect(entry.summary).toContain('wall_clock_timeout');
	});
});

describe('roadmap gate stop reason', () => {
	test('a roadmap-gate block ledgers as blocked (exit 0), not no_work', async () => {
		const store = await makeStore('roadmap-gate-blocked');
		// A roadmap with milestones but no feature mappings leaves feature-core unmapped,
		// which hard-blocks coding work selection.
		await writeFile(
			join(store.metadataDir, 'roadmap.json'),
			`${JSON.stringify({ milestones: { MVP: {} }, features: {} })}\n`,
		);

		const exitCode = await runOrchestrator(plan(store.projectDir), {
			backend: new FakeBackend([]),
			rootDir,
			store,
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		const ledger = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
		const entry = JSON.parse(ledger.trim().split('\n').at(-1) ?? '{}') as {
			exitCode: number;
			stopReason: string;
			summary: string;
		};
		expect(entry.stopReason).toBe('blocked');
		expect(entry.exitCode).toBe(orchestratorExitCodes.success);
		expect(entry.summary).toContain('feature-core');
	});
});

describe('runLedgerDirty reflects only non-harness dirt', () => {
	test(
		'harness-authored .aidd dirt does not flag the run dirty; real project dirt does',
		async () => {
			const store = await makeStore('ledger-dirt-aidd-only');
			await initializeGitProject(store.projectDir);

			const runA = await runOrchestrator(gitHeavyPlan(store.projectDir), {
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
					async () => {
						await completeFeature(store, 'feature-core');
						await runGit(store.projectDir, [
							'add',
							'.aidd/features/feature-core/feature.json',
						]);
						await runGit(store.projectDir, ['commit', '-m', 'feat: complete feature']);
						// Harness-style residue: an uncommitted .aidd artifact (audit report, CHANGELOG…).
						await writeFile(join(store.metadataDir, 'CHANGELOG.md'), '# changes\n');
					},
				),
			});
			expect(runA).toBe(orchestratorExitCodes.success);
			const entryA = JSON.parse(
				(await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8'))
					.trim()
					.split('\n')
					.at(-1) ?? '{}',
			) as { runLedgerDirty: boolean };
			expect(entryA.runLedgerDirty).toBe(false);
		},
		slowOrchestratorTestTimeoutMs,
	);
});
