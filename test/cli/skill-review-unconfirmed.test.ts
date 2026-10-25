import type { AgentEvent } from '../../shared/src/backends/types.ts';

import { afterAll, describe, expect, test } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runOrchestrator } from '../../cli/src/orchestrator/orchestrator.ts';
import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';
import { parseArgs } from '../../shared/src/args/index.ts';
import { writeSkillReport } from '../../shared/src/metadata/skill-reports.ts';
import { orchestratorExitCodes } from '../../shared/src/orchestrator/result.ts';
import {
	config,
	createOrchestratorTestContext,
	FakeBackend,
	rootDir,
	slowOrchestratorTestTimeoutMs,
} from './_helpers/orchestrator-fixture.ts';

// smokestack run_1792880714687_fe6b5855 (2026-10-24, #21788): a review-only feature-review run
// finished its review, wrote the complete report as its final message, and ended without the
// AIDD_RESULT line. aidd rightly recorded missing_aidd_result (exit 73), and then the report was
// gone, because a review-only report was only ever saved from the result payload.

const { cleanup, makeStore } = createOrchestratorTestContext('skill-review-unconfirmed');
afterAll(cleanup);

const report = '## Feature Review Report\n\nOne contradiction: `alpha` against `beta`.';

function skillPlan(projectDir: string, intent: 'apply-changes' | 'review-only') {
	const args = parseArgs([
		'--project-dir',
		projectDir,
		'--skill',
		'feature-review',
		'--skill-intent',
		intent,
	]);
	args.customPrompt = 'Review the feature records.';
	return resolveRunPlan(args, { ...config, maxIterations: 1 });
}

/** A review that reads a record, then writes its report and stops without the result line. */
function reviewEvents(finalText: string[]): AgentEvent[] {
	return [
		{ chunk: 'Reading the records first.', type: 'assistant_text' },
		{ args: { path: '.aidd/features' }, tool: 'read', type: 'tool_call' },
		{ result: 'alpha, beta', tool: 'read', type: 'tool_result' },
		...finalText.map((chunk): AgentEvent => ({ chunk, type: 'assistant_text' })),
		{ exitCode: 0, filesModified: [], type: 'done' },
	];
}

async function runWith(
	name: string,
	intent: 'apply-changes' | 'review-only',
	events: AgentEvent[],
	before?: (projectDir: string) => Promise<unknown>,
) {
	const store = await makeStore(name);
	await before?.(store.projectDir);
	const plan = skillPlan(store.projectDir, intent);
	const exit = await runOrchestrator(plan, { backend: new FakeBackend(events), rootDir, store });
	const ledger = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
	const entry = JSON.parse(ledger.trim().split('\n').at(-1) ?? '{}') as { summary: string };
	const reportsDir = join(store.metadataDir, 'reports');
	const reports = (await readdir(reportsDir).catch(() => [] as string[])).sort();
	return { exit, reports, reportsDir, summary: entry.summary };
}

const today = (): string => `feature-review-${new Date().toISOString().slice(0, 10)}`;

describe('a review-only skill run that ends without its result line', () => {
	test(
		'is still recorded as missing its result, and its final message is kept as an unconfirmed report',
		async () => {
			const run = await runWith(
				'kept',
				'review-only',
				reviewEvents(['All records read. The report follows.', report]),
			);
			expect(run.exit).toBe(orchestratorExitCodes.missingResult);
			expect(run.reports).toEqual([`${today()}-unconfirmed.md`]);
			const saved = await readFile(join(run.reportsDir, run.reports[0] ?? ''), 'utf8');
			const [header = ''] = saved.split('\n');
			expect(header).toMatch(
				/^<!-- Saved by aidd from review-only run \S+ of skill feature-review at \d{4}-/,
			);
			expect(header).toContain('UNCONFIRMED: the run ended without its AIDD_RESULT line');
			expect(saved).toContain('All records read. The report follows.');
			expect(saved).toContain(report);
			// Only what came after the last tool call is the report.
			expect(saved).not.toContain('Reading the records first.');
			expect(run.summary).toContain(
				`kept as an unconfirmed report at .aidd/reports/${today()}-unconfirmed.md`,
			);
		},
		slowOrchestratorTestTimeoutMs,
	);

	test(
		'never replaces a report a run handed back earlier the same day',
		async () => {
			const run = await runWith(
				'beside-confirmed',
				'review-only',
				reviewEvents([report]),
				(projectDir) =>
					writeSkillReport(projectDir, 'feature-review', '# The confirmed one'),
			);
			expect(run.exit).toBe(orchestratorExitCodes.missingResult);
			expect(run.reports).toEqual([`${today()}-unconfirmed.md`, `${today()}.md`]);
			expect(await readFile(join(run.reportsDir, `${today()}.md`), 'utf8')).toContain(
				'# The confirmed one',
			);
		},
		slowOrchestratorTestTimeoutMs,
	);

	test(
		'keeps nothing when it said nothing after its last tool call',
		async () => {
			const run = await runWith('silent', 'review-only', reviewEvents([]));
			expect(run.exit).toBe(orchestratorExitCodes.missingResult);
			expect(run.reports).toEqual([]);
		},
		slowOrchestratorTestTimeoutMs,
	);

	test(
		'keeps nothing for a run that was allowed to change the project',
		async () => {
			const run = await runWith('apply', 'apply-changes', reviewEvents([report]));
			expect(run.exit).toBe(orchestratorExitCodes.missingResult);
			expect(run.reports).toEqual([]);
		},
		slowOrchestratorTestTimeoutMs,
	);
});
