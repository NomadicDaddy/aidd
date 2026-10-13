import { afterAll, describe, expect, test } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runOrchestrator } from '../../cli/src/orchestrator/orchestrator.ts';
import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';
import { compileResultContract } from '../../cli/src/prompts/compile/result-contract.ts';
import { parseArgs } from '../../shared/src/args/index.ts';
import { skillReportPath } from '../../shared/src/metadata/skill-reports.ts';
import {
	config,
	createOrchestratorTestContext,
	FakeBackend,
	rootDir,
	slowOrchestratorTestTimeoutMs,
} from './_helpers/orchestrator-fixture.ts';

const { cleanup, makeStore } = createOrchestratorTestContext('skill-review-report');
afterAll(cleanup);

const report = '# Feature review\n\nTwo records are stale: `alpha` and `beta`.';

/** The plan of a skill run as the CLI builds it once the skill has compiled into a prompt. */
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

async function runWith(
	name: string,
	intent: 'apply-changes' | 'review-only',
	result: Record<string, unknown>,
) {
	const store = await makeStore(name);
	const plan = skillPlan(store.projectDir, intent);
	const backend = new FakeBackend([
		{ chunk: `AIDD_RESULT: ${JSON.stringify(result)}`, type: 'assistant_text' },
		{ exitCode: 0, filesModified: [], type: 'done' },
	]);
	const exit = await runOrchestrator(plan, { backend, rootDir, store });
	const ledger = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
	const entry = JSON.parse(ledger.trim().split('\n').at(-1) ?? '{}') as { summary: string };
	const reports = await readdir(join(store.metadataDir, 'reports')).catch(() => []);
	return { exit, plan, reports, store, summary: entry.summary };
}

describe('the report of a review-only skill run', () => {
	test(
		'is saved by aidd under the skill and the day, and the run summary says where',
		async () => {
			const run = await runWith('saved', 'review-only', {
				directiveCompleted: true,
				reportMarkdown: report,
			});
			expect(run.exit).toBe(0);
			expect(run.plan.prompt.customDirectiveReadonly).toBe(true);
			expect(run.reports).toHaveLength(1);
			const path = skillReportPath(run.store.projectDir, 'feature-review', new Date());
			const saved = await readFile(path, 'utf8');
			expect(saved).toContain(report);
			expect(saved.split('\n')[0]).toMatch(
				/^<!-- Saved by aidd from review-only( run \S+)? of skill feature-review at \d{4}-/,
			);
			expect(saved.endsWith('\n')).toBe(true);
			expect(run.summary).toContain(`report saved to .aidd/reports/${run.reports[0]}`);
		},
		slowOrchestratorTestTimeoutMs,
	);

	test(
		'a run that returned no report still completes and says none was saved',
		async () => {
			const run = await runWith('none', 'review-only', { directiveCompleted: true });
			expect(run.exit).toBe(0);
			expect(run.reports).toEqual([]);
			expect(run.summary).toContain('no report was returned, so none was saved');
		},
		slowOrchestratorTestTimeoutMs,
	);

	test(
		'a blank report is not saved as an empty file',
		async () => {
			const run = await runWith('blank', 'review-only', {
				directiveCompleted: true,
				reportMarkdown: '  \n',
			});
			expect(run.reports).toEqual([]);
			expect(run.summary).toContain('none was saved');
		},
		slowOrchestratorTestTimeoutMs,
	);

	test(
		'a blocked run saves nothing, even when it handed a report back',
		async () => {
			const run = await runWith('blocked', 'review-only', {
				directiveCompleted: false,
				reason: 'records unreadable',
				reportMarkdown: report,
			});
			expect(run.exit).toBe(1);
			expect(run.reports).toEqual([]);
		},
		slowOrchestratorTestTimeoutMs,
	);

	test(
		'a run allowed to change the project is not given a saved report: it writes its own',
		async () => {
			const run = await runWith('apply', 'apply-changes', {
				directiveCompleted: true,
				reportMarkdown: report,
			});
			expect(run.plan.prompt.customDirectiveReadonly).not.toBe(true);
			expect(run.reports).toEqual([]);
			expect(run.summary).not.toContain('report');
		},
		slowOrchestratorTestTimeoutMs,
	);
});

describe('the two record-review skills say where a report goes when the run may not write', () => {
	test('feature-review has a status scope, checks other records for accuracy and rewrites only backlog', async () => {
		const body = await readFile(join(rootDir, 'skills/feature-review/SKILL.md'), 'utf8');
		expect(body).toContain(
			'feature-review [app] [--status backlog|all|<status>[,<status>...]]',
		);
		expect(body).toContain('The default is `backlog`');
		expect(body).toContain('#### 3h. Record Accuracy');
		expect(body).toContain('A record you did not check is never **current**.');
		expect(body).toContain('**Only backlog records are rewritten.**');
		expect(body).toContain("return the same complete report through the run's result contract");
	});

	test('feature-coverage-audit leaves a dated report when it writes nothing itself', async () => {
		const body = await readFile(
			join(rootDir, 'skills/feature-coverage-audit/SKILL.md'),
			'utf8',
		);
		expect(body).toContain('.aidd/reports/feature-coverage-audit-YYYY-MM-DD.md');
		expect(body).toContain('aidd saves it at\nthat same path');
	});
});

describe('the result contract tells only a review-only skill run to hand its report back', () => {
	test('review-only skill run', async () => {
		const store = await makeStore('contract-review');
		const contract = compileResultContract(skillPlan(store.projectDir, 'review-only').prompt);
		expect(contract).toContain('"reportMarkdown"');
		expect(contract).toContain('/.aidd/reports/feature-review-<date>.md');
		expect(contract).toContain('do not write that file or any other yourself');
	});

	test('skill run allowed to change the project', async () => {
		const store = await makeStore('contract-apply');
		const contract = compileResultContract(skillPlan(store.projectDir, 'apply-changes').prompt);
		expect(contract).toContain('AIDD_RESULT: {"directiveCompleted":true}');
		expect(contract).not.toContain('reportMarkdown');
	});

	test('read-only directive that is not a skill', async () => {
		const store = await makeStore('contract-plain');
		const plan = resolveRunPlan(
			parseArgs([
				'--project-dir',
				store.projectDir,
				'--prompt',
				'Answer a question.',
				'--directive-readonly',
			]),
			config,
		);
		expect(plan.prompt.customDirectiveReadonly).toBe(true);
		expect(compileResultContract(plan.prompt)).not.toContain('reportMarkdown');
	});
});
