import { afterEach, describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { AgentEvent } from 'aidd-shared/backends/types';

import { defaultFlailingConfig } from 'aidd-shared/backends/flailing';
import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';

import { runOrchestrator } from '../../cli/src/orchestrator/orchestrator.ts';
import {
	completeFeature,
	createOrchestratorTestContext,
	FakeBackend,
	plan,
	rootDir,
	SequencedBackend,
} from './_helpers/orchestrator-fixture.ts';

const { cleanup, makeStore } = createOrchestratorTestContext('flailing');

afterEach(cleanup);

// One dead action repeated past the repeat threshold: the shape the guard exists to catch.
function flailingBatch(): AgentEvent[] {
	return Array.from({ length: defaultFlailingConfig.repeatTripThreshold }, () => ({
		args: { command: 'curl -s http://localhost:3210' },
		tool: 'bash',
		type: 'tool_call' as const,
	}));
}

const completionBatch: AgentEvent[] = [
	{
		chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
		type: 'assistant_text',
	},
	{ exitCode: 0, filesModified: [], type: 'done' },
];

async function lastLedgerEntry(metadataDir: string): Promise<Record<string, unknown>> {
	const runs = await readFile(join(metadataDir, 'runs.jsonl'), 'utf8');
	return JSON.parse(runs.trim().split('\n').at(-1) ?? '{}') as Record<string, unknown>;
}

describe('flailing nudge at the orchestration level', () => {
	// The guard is designed to warn first and kill second. Every pipeline skill step launches with
	// --max-iterations 1 (managedStepHandler), so charging the nudge against the iteration budget
	// collapsed that to "first trip kills" and the agent never saw the corrective note. The nudge
	// iteration must therefore run even when the budget is a single iteration.
	test('a first trip retries with the corrective note despite --max-iterations 1', async () => {
		const store = await makeStore('nudge-single-iteration');
		const backend = new SequencedBackend(
			[flailingBatch(), completionBatch],
			async (callIndex) => {
				if (callIndex === 1) await completeFeature(store, 'feature-core');
			},
		);

		const exitCode = await runOrchestrator(plan(store.projectDir, ['--max-iterations', '1']), {
			backend,
			rootDir,
			store,
		});

		expect(backend.calls).toBe(2);
		expect(backend.inputs[1]?.text).toContain('waiting_approval');
		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect((await lastLedgerEntry(store.metadataDir)).stopReason).toBe('completed');
	});

	// The other half of the contract: the exemption must not turn a stuck run into an endless
	// nudge loop. A second consecutive trip ends the run and parks the feature.
	test('a run that keeps flailing stops after the nudge instead of looping', async () => {
		const store = await makeStore('nudge-bounded');
		const backend = new FakeBackend(flailingBatch());

		const exitCode = await runOrchestrator(plan(store.projectDir, ['--max-iterations', '1']), {
			backend,
			rootDir,
			store,
		});

		expect(backend.calls).toBe(2);
		expect(exitCode).toBe(orchestratorExitCodes.success);
		const entry = await lastLedgerEntry(store.metadataDir);
		expect(entry.stopReason).toBe('flailing');
		const feature = JSON.parse(
			await readFile(
				join(store.metadataDir, 'features', 'feature-core', 'feature.json'),
				'utf8',
			),
		) as { status: string };
		expect(feature.status).toBe('waiting_approval');
	});
});
