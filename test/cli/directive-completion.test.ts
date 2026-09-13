import { afterAll, describe, expect, test } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runOrchestrator } from '../../cli/src/orchestrator/orchestrator.ts';
import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';
import { parseArgs } from '../../shared/src/args/index.ts';
import {
	config,
	createOrchestratorTestContext,
	FakeBackend,
	rootDir,
	slowOrchestratorTestTimeoutMs,
} from './_helpers/orchestrator-fixture.ts';

const { cleanup, makeStore } = createOrchestratorTestContext('directive-completion');
afterAll(cleanup);

describe('directive completion through the orchestrator', () => {
	for (const scenario of [
		{
			name: 'completed scoped review',
			result: { directiveCompleted: true },
			exit: 0,
			stop: 'completed',
		},
		{
			name: 'partial artifacts',
			result: { directiveCompleted: false, reason: 'CONTEXT.md requires a domain decision' },
			exit: 1,
			stop: 'blocked',
		},
		{
			name: 'missing required skill',
			result: { directiveCompleted: false, reason: 'Required review contract is unreadable' },
			exit: 1,
			stop: 'blocked',
		},
		{
			name: 'restricted skill without replacement',
			result: {
				directiveCompleted: false,
				reason: 'Requested interview is invocation-restricted',
			},
			exit: 1,
			stop: 'blocked',
		},
	]) {
		test(
			scenario.name,
			async () => {
				const store = await makeStore(scenario.name.replaceAll(' ', '-'));
				const runtimePlan = resolveRunPlan(
					parseArgs([
						'--project-dir',
						store.projectDir,
						'--prompt',
						'Review all requested artifacts.',
					]),
					{ ...config, maxIterations: 3 },
				);
				const backend = new FakeBackend(
					[
						{
							type: 'assistant_text',
							chunk: `AIDD_RESULT: ${JSON.stringify(scenario.result)}`,
						},
						{ type: 'done', exitCode: 0, filesModified: [] },
					],
					async () => {
						// A completed independent artifact cannot rescue a blocked overall directive.
						await writeFile(
							join(store.metadataDir, 'screen-map.md'),
							'# Reviewed screen map\n',
						);
					},
				);
				const exit = await runOrchestrator(runtimePlan, { backend, rootDir, store });
				expect(exit).toBe(scenario.exit);
				expect(backend.calls).toBe(1);
				const ledger = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
				const entry = JSON.parse(ledger.trim().split('\n').at(-1) ?? '{}') as {
					exitCode: number;
					stopReason: string;
					summary: string;
				};
				expect(entry.exitCode).toBe(scenario.exit);
				expect(entry.stopReason).toBe(scenario.stop);
				if ('reason' in scenario.result)
					expect(entry.summary).toContain(scenario.result.reason);
				const iteration = JSON.parse(
					await readFile(join(store.metadataDir, 'iterations/001.json'), 'utf8'),
				) as { exitCode: number };
				expect(iteration.exitCode).toBe(scenario.exit);
			},
			slowOrchestratorTestTimeoutMs,
		);
	}
});
