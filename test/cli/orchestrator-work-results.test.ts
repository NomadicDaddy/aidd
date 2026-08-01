import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'aidd-shared/args/index';
import type { AgentEvent, CLIBackend } from 'aidd-shared/backends/types';
import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';

import { runOrchestrator } from '../../cli/src/orchestrator/orchestrator.ts';
import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';
import {
	addFeature,
	completeFeature,
	config,
	createOrchestratorTestContext,
	FakeBackend,
	gitHeavyPlan,
	gitText,
	initializeGitProject,
	plan,
	rootDir,
	runGit,
	SequencedBackend,
	slowOrchestratorTestTimeoutMs,
} from './_helpers/orchestrator-fixture.ts';

const { cleanup, makeStore } = createOrchestratorTestContext('work-results');

afterEach(cleanup);

describe('orchestrator work results', () => {
	test(
		'runs multiple requested audits in one batched backend call',
		async () => {
			const store = await makeStore('multi-audit');
			const backend = new SequencedBackend([
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"auditReports":[{"auditName":"SECURITY","auditFindings":[],"noFindingsJustification":"Inspected src/**/*.ts with rg for hardcoded token literals; every match was test fixture data, so nothing qualified.","reportMarkdown":"# SECURITY Audit Report"},{"auditName":"DEAD_CODE","auditFindings":[],"noFindingsJustification":"Ran rg for unreferenced exports in cli/src/**/*.ts and confirmed each export is imported by production code.","reportMarkdown":"# DEAD_CODE Audit Report"}]}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
			]);
			const auditPlan = resolveRunPlan(
				parseArgs([
					'--project-dir',
					store.projectDir,
					'--cli',
					'native',
					'--audit',
					'SECURITY,DEAD_CODE',
				]),
				config,
			);

			const exitCode = await runOrchestrator(auditPlan, { rootDir, store, backend });

			expect(exitCode).toBe(orchestratorExitCodes.success);
			expect(backend.calls).toBe(1);
			const reports = await store.listAuditReports();
			expect(reports.some((report) => report.startsWith('SECURITY-'))).toBe(true);
			expect(reports.some((report) => report.startsWith('DEAD_CODE-'))).toBe(true);
			const iterationJson = await readFile(
				join(store.metadataDir, 'iterations', '001.json'),
				'utf8',
			);
			const structured = JSON.parse(iterationJson) as {
				auditBatchMode: boolean;
				auditBatchParallelInstruction: boolean;
				completedAudits: string[];
				findingsContractDropped?: boolean;
				missingAudits: string[];
				outcome: { status: string };
				perAuditFindingTotals: Record<string, number>;
				selectedAuditBatch: string[];
			};
			expect(structured.auditBatchMode).toBe(true);
			expect(structured.auditBatchParallelInstruction).toBe(true);
			expect(structured.completedAudits).toEqual(['SECURITY', 'DEAD_CODE']);
			expect(structured.findingsContractDropped).toBeUndefined();
			expect(structured.missingAudits).toEqual([]);
			expect(structured.outcome.status).toBe('success');
			expect(structured.perAuditFindingTotals).toEqual({ DEAD_CODE: 0, SECURITY: 0 });
			expect(structured.selectedAuditBatch).toEqual(['SECURITY', 'DEAD_CODE']);
		},
		slowOrchestratorTestTimeoutMs,
	);

	test(
		'rejects a batched audit whose empty reports lack justification without persisting them',
		async () => {
			const store = await makeStore('multi-audit-empty');
			const backend = new SequencedBackend([
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"auditReports":[{"auditName":"SECURITY","auditFindings":[],"reportMarkdown":"# SECURITY Audit Report"},{"auditName":"DEAD_CODE","auditFindings":[],"reportMarkdown":"# DEAD_CODE Audit Report"}]}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[{ type: 'error', reason: 'provider' }],
			]);
			const auditPlan = resolveRunPlan(
				parseArgs([
					'--project-dir',
					store.projectDir,
					'--cli',
					'native',
					'--audit',
					'SECURITY,DEAD_CODE',
				]),
				config,
			);

			const exitCode = await runOrchestrator(auditPlan, { rootDir, store, backend });

			// Both invalid reports remain queued. The retry's provider error becomes the final
			// result, while neither rejected report can become freshness data.
			expect(exitCode).toBe(orchestratorExitCodes.providerError);
			expect(backend.calls).toBe(2);
			const reports = await store.listAuditReports();
			expect(reports.some((report) => report.startsWith('SECURITY-'))).toBe(false);
			expect(reports.some((report) => report.startsWith('DEAD_CODE-'))).toBe(false);
			const structured = JSON.parse(
				await readFile(join(store.metadataDir, 'iterations', '001.json'), 'utf8'),
			) as { invalidAuditReports: unknown[]; missingAudits: string[] };
			expect(structured.invalidAuditReports).toHaveLength(2);
			expect(structured.missingAudits).toEqual(['SECURITY', 'DEAD_CODE']);
		},
		slowOrchestratorTestTimeoutMs,
	);

	test(
		'fails a batched audit with boilerplate zero-finding justification',
		async () => {
			const store = await makeStore('multi-audit-boilerplate-empty');
			const backend = new SequencedBackend([
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"auditReports":[{"auditName":"SECURITY","auditFindings":[],"noFindingsJustification":"No issues found.","reportMarkdown":"# SECURITY Audit Report"},{"auditName":"DEAD_CODE","auditFindings":[],"noFindingsJustification":"Ran rg for unreferenced exports in cli/src/**/*.ts and confirmed each export is imported by production code.","reportMarkdown":"# DEAD_CODE Audit Report"}]}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[{ type: 'error', reason: 'provider' }],
			]);
			const auditPlan = resolveRunPlan(
				parseArgs([
					'--project-dir',
					store.projectDir,
					'--cli',
					'native',
					'--audit',
					'SECURITY,DEAD_CODE',
				]),
				config,
			);

			const exitCode = await runOrchestrator(auditPlan, { rootDir, store, backend });

			expect(exitCode).toBe(orchestratorExitCodes.providerError);
			expect(backend.calls).toBe(2);
			const reports = await store.listAuditReports();
			expect(reports.some((report) => report.startsWith('SECURITY-'))).toBe(false);
			expect(reports.some((report) => report.startsWith('DEAD_CODE-'))).toBe(true);
			const structured = JSON.parse(
				await readFile(join(store.metadataDir, 'iterations', '001.json'), 'utf8'),
			) as { invalidAuditReports: unknown[]; missingAudits: string[] };
			expect(structured.invalidAuditReports).toHaveLength(1);
			expect(structured.missingAudits).toEqual(['SECURITY']);
		},
		slowOrchestratorTestTimeoutMs,
	);

	test(
		'fails a single audit whose zero-finding report has no justification',
		async () => {
			const store = await makeStore('single-audit-unjustified-empty');
			const backend = new SequencedBackend([
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"auditFindings":[],"reportMarkdown":"# SECURITY Audit Report\\n\\nAll clean."}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[{ type: 'error', reason: 'provider' }],
			]);
			const auditPlan = resolveRunPlan(
				parseArgs([
					'--project-dir',
					store.projectDir,
					'--cli',
					'native',
					'--audit',
					'SECURITY',
				]),
				config,
			);

			const exitCode = await runOrchestrator(auditPlan, { rootDir, store, backend });

			expect(exitCode).toBe(orchestratorExitCodes.providerError);
			expect(backend.calls).toBe(2);
			expect(await store.listAuditReports()).toEqual([]);
			const structured = JSON.parse(
				await readFile(join(store.metadataDir, 'iterations', '001.json'), 'utf8'),
			) as { invalidAuditReports: unknown[]; missingAudits: string[] };
			expect(structured.invalidAuditReports).toHaveLength(1);
			expect(structured.missingAudits).toEqual(['SECURITY']);
		},
		slowOrchestratorTestTimeoutMs,
	);

	test(
		'records missing result when a batched report carries malformed findings',
		async () => {
			const store = await makeStore('batch-malformed-findings');
			const backend = new SequencedBackend([
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"auditReports":[{"auditName":"SECURITY","auditFindings":[null],"reportMarkdown":"# SECURITY Audit Report"},{"auditName":"DEAD_CODE","auditFindings":[],"noFindingsJustification":"Ran rg for unreferenced exports in cli/src/**/*.ts and confirmed each export is imported by production code.","reportMarkdown":"# DEAD_CODE Audit Report"}]}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[{ type: 'error', reason: 'provider' }],
			]);
			const auditPlan = resolveRunPlan(
				parseArgs([
					'--project-dir',
					store.projectDir,
					'--cli',
					'native',
					'--audit',
					'SECURITY,DEAD_CODE',
				]),
				config,
			);

			const exitCode = await runOrchestrator(auditPlan, { rootDir, store, backend });

			// The malformed SECURITY report is rejected atomically (nothing persisted) and the
			// audit re-queued; the retry here hits a provider error, which becomes the exit.
			expect(exitCode).toBe(orchestratorExitCodes.providerError);
			expect(backend.calls).toBe(2);
			const reports = await store.listAuditReports();
			expect(reports.some((report) => report.startsWith('SECURITY-'))).toBe(false);
			expect(reports.some((report) => report.startsWith('DEAD_CODE-'))).toBe(true);
			const structured = JSON.parse(
				await readFile(join(store.metadataDir, 'iterations', '001.json'), 'utf8'),
			) as {
				invalidAuditReports: { auditName?: string; reason: string }[];
				missingAudits: string[];
			};
			expect(structured.missingAudits).toEqual(['SECURITY']);
			expect(structured.invalidAuditReports[0]?.auditName).toBe('SECURITY');
			expect(structured.invalidAuditReports[0]?.reason).toContain('not an object');
		},
		slowOrchestratorTestTimeoutMs,
	);

	test('does not mark omitted batched audits complete', async () => {
		const store = await makeStore('multi-audit-missing');
		const backend = new SequencedBackend([
			[
				{
					type: 'assistant_text',
					chunk: 'AIDD_RESULT: {"auditReports":[{"auditName":"SECURITY","auditFindings":[],"noFindingsJustification":"Inspected src/**/*.ts with rg for hardcoded token literals; every match was test fixture data, so nothing qualified.","reportMarkdown":"# SECURITY Audit Report"}]}\n',
				},
				{ type: 'done', exitCode: 0, filesModified: [] },
			],
			[{ type: 'error', reason: 'provider' }],
		]);
		const auditPlan = resolveRunPlan(
			parseArgs([
				'--project-dir',
				store.projectDir,
				'--cli',
				'native',
				'--audit',
				'SECURITY,DEAD_CODE',
			]),
			config,
		);

		const exitCode = await runOrchestrator(auditPlan, { rootDir, store, backend });

		expect(exitCode).toBe(orchestratorExitCodes.providerError);
		expect(backend.calls).toBe(2);
		const reports = await store.listAuditReports();
		expect(reports.some((report) => report.startsWith('SECURITY-'))).toBe(true);
		expect(reports.some((report) => report.startsWith('DEAD_CODE-'))).toBe(false);
		const iterationJson = await readFile(
			join(store.metadataDir, 'iterations', '001.json'),
			'utf8',
		);
		const structured = JSON.parse(iterationJson) as {
			completedAudits: string[];
			missingAudits: string[];
		};
		expect(structured.completedAudits).toEqual(['SECURITY']);
		expect(structured.missingAudits).toEqual(['DEAD_CODE']);
	});

	test('audit-mode iteration does not report historical completions as newly completed', async () => {
		const store = await makeStore('audit-existing-completed-feature');
		await completeFeature(store, 'feature-core');
		await addFeature(store, 'feature-pending', 2);
		const backend = new SequencedBackend([
			[
				{
					type: 'assistant_text',
					chunk: 'AIDD_RESULT: {"auditFindings":[],"noFindingsJustification":"Inspected src/**/*.ts with rg for hardcoded token literals; every match was test fixture data, so nothing qualified.","reportMarkdown":"# SECURITY Audit Report"}\n',
				},
				{ type: 'done', exitCode: 0, filesModified: [] },
			],
		]);
		const auditPlan = resolveRunPlan(
			parseArgs([
				'--project-dir',
				store.projectDir,
				'--cli',
				'native',
				'--audit',
				'SECURITY',
			]),
			config,
		);

		const exitCode = await runOrchestrator(auditPlan, { rootDir, store, backend });

		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(backend.calls).toBe(1);
		const iteration = JSON.parse(
			await readFile(join(store.metadataDir, 'iterations', '001.json'), 'utf8'),
		) as {
			completedFeatures: string[];
			exitCode: number;
			extraCompletedFeatures: string[];
			scopeOverrun: boolean;
			selectedFeatures: string[];
			stopReason: string;
		};
		expect(iteration.selectedFeatures).toEqual([]);
		expect(iteration.completedFeatures).toEqual([]);
		expect(iteration.extraCompletedFeatures).toEqual([]);
		expect(iteration.scopeOverrun).toBe(false);

		type ScopeOverrunRunSummary = {
			exitCode: number;
			stopReason: string;
		} & typeof iteration;
		const runSummaries = (await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8'))
			.trim()
			.split(/\r?\n/)
			.map((line) => JSON.parse(line) as ScopeOverrunRunSummary);
		expect(runSummaries).toHaveLength(1);
		const runSummary = runSummaries[0];
		if (runSummary === undefined) throw new Error('expected one run summary');
		expect(runSummary.completedFeatures).toEqual([]);
	});

	test('skips backend when coding mode has no work', async () => {
		const store = await makeStore('no-work');
		await store.writeFeature({ id: 'feature-core', status: 'completed', passes: true });
		const backend = new FakeBackend([{ type: 'error', reason: 'provider' }]);

		const exitCode = await runOrchestrator(plan(store.projectDir), {
			rootDir,
			store,
			backend,
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(backend.calls).toBe(0);
		const structured = JSON.parse(
			await readFile(join(store.metadataDir, 'iterations', '001.json'), 'utf8'),
		) as { summary: string; selectedWork: { kind: string } };
		// A skipped no-work iteration now surfaces the specific selection reason (the
		// SelectedWork description) rather than the terse breakdown summary.
		expect(structured.summary).toContain('No incomplete coding features are available');
		expect(structured.selectedWork.kind).toBe('none');
	});

	test(
		'reports pending approval when coding mode has no approved work',
		async () => {
			const store = await makeStore('pending-approval-no-work');
			await store.writeFeature({
				id: 'feature-core',
				status: 'waiting_approval',
				passes: false,
			});
			const backend = new FakeBackend([{ type: 'error', reason: 'provider' }]);

			const exitCode = await runOrchestrator(plan(store.projectDir), {
				rootDir,
				store,
				backend,
			});

			expect(exitCode).toBe(orchestratorExitCodes.success);
			expect(backend.calls).toBe(0);
			const structured = JSON.parse(
				await readFile(join(store.metadataDir, 'iterations', '001.json'), 'utf8'),
			) as {
				remainingPendingApproval: number;
				summary: string;
				selectedWork: { data: { pendingApproval: number }; kind: string };
			};
			expect(structured.summary).toContain(
				'No approved incomplete coding features are available',
			);
			expect(structured.summary).toContain('1 feature(s) are pending approval');
			expect(structured.selectedWork.kind).toBe('none');
			expect(structured.selectedWork.data.pendingApproval).toBe(1);
			expect(structured.remainingPendingApproval).toBe(1);
		},
		slowOrchestratorTestTimeoutMs,
	);

	test(
		'reports dependency-blocked backlog separately from finished work',
		async () => {
			const store = await makeStore('dependency-blocked-no-work');
			await store.writeFeature({
				id: 'feature-core',
				status: 'backlog',
				passes: false,
				priority: 1,
				dependencies: ['feature-missing'],
			});
			const backend = new FakeBackend([{ type: 'error', reason: 'provider' }]);

			const exitCode = await runOrchestrator(plan(store.projectDir), {
				rootDir,
				store,
				backend,
			});

			expect(exitCode).toBe(orchestratorExitCodes.success);
			expect(backend.calls).toBe(0);
			const structured = JSON.parse(
				await readFile(join(store.metadataDir, 'iterations', '001.json'), 'utf8'),
			) as {
				remainingDependencyBlockedFeatures: number;
				summary: string;
				selectedWork: {
					data: { dependencyBlocked: number; eligible: number; incomplete: number };
					kind: string;
				};
			};
			expect(structured.summary).toContain(
				'No eligible incomplete coding features are available',
			);
			expect(structured.summary).toContain('1 feature(s) are dependency-blocked');
			expect(structured.selectedWork.kind).toBe('none');
			expect(structured.selectedWork.data.dependencyBlocked).toBe(1);
			expect(structured.selectedWork.data.eligible).toBe(0);
			expect(structured.selectedWork.data.incomplete).toBe(1);
			expect(structured.remainingDependencyBlockedFeatures).toBe(1);
		},
		slowOrchestratorTestTimeoutMs,
	);

	test(
		'classifies unattended dirty-worktree questions as blocked runs',
		async () => {
			const store = await makeStore('dirty-question-blocked');
			// Fixture-local repo, deliberately without a commit: the scaffolded .aidd files
			// stay untracked so the residual-dirty check counts them. Without this the count
			// falls through to the host repo, which ignores .tmp*/ and reports 0.
			await runGit(store.projectDir, ['init']);
			const backend = new FakeBackend([
				{
					type: 'tool_call',
					tool: 'AskUserQuestion',
					args: {
						questions: [
							{
								question: 'Dirty working tree detected. How should I proceed?',
							},
						],
					},
				},
				{ type: 'done', exitCode: 0, filesModified: [] },
			]);

			const exitCode = await runOrchestrator(plan(store.projectDir), {
				rootDir,
				store,
				backend,
			});

			expect(exitCode).toBe(orchestratorExitCodes.success);
			const iteration = JSON.parse(
				await readFile(join(store.metadataDir, 'iterations', '001.json'), 'utf8'),
			) as { exitCode: number; outcome: { status: string } };
			expect(iteration.exitCode).toBe(orchestratorExitCodes.success);
			expect(iteration.outcome.status).toBe('blocked_dirty_worktree');

			const [runSummary] = (await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8'))
				.trim()
				.split(/\r?\n/)
				.map((line) => JSON.parse(line) as { stopReason: string; exitCode: number });
			expect(runSummary?.stopReason).toBe('blocked_dirty_worktree');
			expect(runSummary?.exitCode).toBe(orchestratorExitCodes.success);
		},
		slowOrchestratorTestTimeoutMs,
	);

	test(
		'reports partial success when later work blocks on unattended dirty-worktree input',
		async () => {
			const store = await makeStore('partial-success-dirty-question');
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
							type: 'tool_call',
							tool: 'AskUserQuestion',
							args: {
								questions: [
									{
										question:
											'Dirty working tree contains previous edits. How should I proceed?',
									},
								],
							},
						},
						{ type: 'done', exitCode: 0, filesModified: [] },
					],
				],
				async (callIndex) => {
					if (callIndex === 0) await completeFeature(store, 'feature-core');
				},
			);

			const exitCode = await runOrchestrator(plan(store.projectDir), {
				rootDir,
				store,
				backend,
			});

			expect(exitCode).toBe(orchestratorExitCodes.success);
			expect(backend.calls).toBe(2);
			const [runSummary] = (await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8'))
				.trim()
				.split(/\r?\n/)
				.map(
					(line) =>
						JSON.parse(line) as {
							completedFeatures: string[];
							stopReason: string;
							summary: string;
						},
				);
			expect(runSummary?.stopReason).toBe('partial_success_blocked');
			expect(runSummary?.completedFeatures).toEqual(['feature-core']);
			expect(runSummary?.summary).toContain('partial success: 1 feature(s) completed');
		},
		slowOrchestratorTestTimeoutMs,
	);

	test(
		'records untracked feature directories as run artifact warnings',
		async () => {
			const store = await makeStore('untracked-feature-dir-warning');
			await store.writeFeature({
				id: 'feature-core',
				status: 'completed',
				passes: true,
				priority: 1,
			});
			await initializeGitProject(store.projectDir);
			await mkdir(join(store.metadataDir, 'features', 'feature-extra'), { recursive: true });
			await writeFile(
				join(store.metadataDir, 'features', 'feature-extra', 'feature.json'),
				JSON.stringify({
					id: 'feature-extra',
					title: 'Extra feature',
					status: 'completed',
					passes: true,
					priority: 2,
				}),
			);
			await writeFile(join(store.metadataDir, 'features', 'stray.json'), '{}');

			const exitCode = await runOrchestrator(plan(store.projectDir), {
				rootDir,
				store,
				backend: new FakeBackend([{ type: 'error', reason: 'provider' }]),
			});

			expect(exitCode).toBe(orchestratorExitCodes.success);
			const [runSummary] = (await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8'))
				.trim()
				.split(/\r?\n/)
				.map(
					(line) =>
						JSON.parse(line) as {
							artifactWarnings: string[];
							residualUntrackedFeatureDirs: string[];
						},
				);
			expect(runSummary?.artifactWarnings).toEqual(['untracked_feature_directories']);
			expect(runSummary?.residualUntrackedFeatureDirs).toEqual(['feature-extra']);
		},
		slowOrchestratorTestTimeoutMs,
	);

	test(
		'accepts selected feature after agent updates metadata before structured result',
		async () => {
			const store = await makeStore('feature-result');
			const exitCode = await runOrchestrator(plan(store.projectDir), {
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
			});

			const feature = await store.readFeature('feature-core');
			expect(exitCode).toBe(orchestratorExitCodes.success);
			expect(feature.status).toBe('completed');
			expect(feature.passes).toBe(true);
		},
		slowOrchestratorTestTimeoutMs,
	);

	// One overrun is a scoping mistake by one iteration, not grounds for discarding a run that is
	// otherwise committing clean work. It is recorded on the iteration and the run summary, and the
	// next iteration is handed a corrective note — but the run keeps going.
	test('records a first scope overrun without ending the run', async () => {
		const store = await makeStore('queued-feature-marker-issue');
		await addFeature(store, 'feature-extra', 2);
		const exitCode = await runOrchestrator(plan(store.projectDir), {
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
					await completeFeature(store, 'feature-extra');
				},
			),
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		const iteration = JSON.parse(
			await readFile(join(store.metadataDir, 'iterations', '001.json'), 'utf8'),
		) as {
			allowedFeatureIds: string[];
			completionMarkerIssue: string;
			completedFeatures: string[];
			extraCompletedFeatures: string[];
			scopeOverrun: boolean;
			selectedFeatures: string[];
			unacceptedCompletedFeatures: string[];
		};
		expect(iteration.allowedFeatureIds).toEqual(['feature-core']);
		expect(iteration.selectedFeatures).toEqual(['feature-core']);
		expect(iteration.completedFeatures).toEqual(['feature-core', 'feature-extra']);
		expect(iteration.extraCompletedFeatures).toEqual(['feature-extra']);
		expect(iteration.unacceptedCompletedFeatures).toEqual([]);
		expect(iteration.completionMarkerIssue).toBeUndefined();
		expect(iteration.scopeOverrun).toBe(true);

		type ScopeOverrunRunSummary = {
			exitCode: number;
			stopReason: string;
		} & typeof iteration;
		const runSummaries = (await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8'))
			.trim()
			.split(/\r?\n/)
			.map((line) => JSON.parse(line) as ScopeOverrunRunSummary);
		expect(runSummaries).toHaveLength(1);
		const runSummary = runSummaries[0];
		if (runSummary === undefined) throw new Error('expected one run summary');
		expect(runSummary.selectedFeatures).toEqual(['feature-core']);
		expect(runSummary.completedFeatures).toEqual(['feature-core', 'feature-extra']);
		expect(runSummary.scopeOverrun).toBe(true);
		expect(runSummary.stopReason).toBe('completed');
		expect(runSummary.exitCode).toBe(orchestratorExitCodes.success);
	});

	test(
		'attributes a markerless queued-feature completion to the overrun, not the marker check',
		async () => {
			const store = await makeStore('queued-feature-no-marker');
			await addFeature(store, 'feature-extra', 2);
			const exitCode = await runOrchestrator(plan(store.projectDir), {
				rootDir,
				store,
				backend: new FakeBackend([{ type: 'done', exitCode: 0, filesModified: [] }], () =>
					completeFeature(store, 'feature-extra'),
				),
			});

			// The marker check no longer decides this run's fate: the iteration is recorded as an
			// overrun and the run ends on the missing marker, which is what actually went wrong.
			expect(exitCode).toBe(orchestratorExitCodes.missingResult);
			const iteration = JSON.parse(
				await readFile(join(store.metadataDir, 'iterations', '001.json'), 'utf8'),
			) as {
				allowedFeatureIds: string[];
				completionMarkerIssue: string;
				completedFeatures: string[];
				extraCompletedFeatures: string[];
				scopeOverrun: boolean;
				selectedFeatures: string[];
				unacceptedCompletedFeatures: string[];
			};
			expect(iteration.allowedFeatureIds).toEqual(['feature-core']);
			expect(iteration.selectedFeatures).toEqual([]);
			expect(iteration.completedFeatures).toEqual(['feature-extra']);
			expect(iteration.extraCompletedFeatures).toEqual(['feature-extra']);
			expect(iteration.unacceptedCompletedFeatures).toEqual([]);
			expect(iteration.completionMarkerIssue).toBeUndefined();
			expect(iteration.scopeOverrun).toBe(true);
		},
		slowOrchestratorTestTimeoutMs,
	);

	// The corrective note buys the agent exactly one mistake. A second iteration that completes a
	// *different* out-of-scope feature means the boundary is not being respected, and that ends the
	// run — otherwise a run could redefine its own scope indefinitely.
	test(
		'a second scope overrun ends the run',
		async () => {
			const store = await makeStore('second-scope-overrun');
			await addFeature(store, 'feature-second', 2);
			await addFeature(store, 'feature-extra', 3);
			await addFeature(store, 'feature-extra-two', 4);
			const marker = (id: string): AgentEvent => ({
				chunk: `AIDD_RESULT: {"featureId":"${id}","status":"completed","passes":true}\n`,
				type: 'assistant_text',
			});
			const done: AgentEvent = { exitCode: 0, filesModified: [], type: 'done' };
			const exitCode = await runOrchestrator(plan(store.projectDir), {
				rootDir,
				store,
				backend: new SequencedBackend(
					[
						[marker('feature-core'), done],
						[marker('feature-second'), done],
					],
					async (callIndex) => {
						// Each iteration completes its own assigned feature plus a different one it was
						// never given — two distinct overruns, not the same one seen twice.
						await completeFeature(
							store,
							callIndex === 0 ? 'feature-core' : 'feature-second',
						);
						await completeFeature(
							store,
							callIndex === 0 ? 'feature-extra' : 'feature-extra-two',
						);
					},
				),
			});

			expect(exitCode).toBe(orchestratorExitCodes.validationError);
			const runSummary = JSON.parse(
				(await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8'))
					.trim()
					.split(/\r?\n/)[0] ?? '{}',
			) as { stopReason: string; summary: string };
			expect(runSummary.stopReason).toBe('blocked');
			expect(runSummary.summary).toContain('scope_overrun');
			expect(runSummary.summary).toContain('feature-extra-two');
		},
		slowOrchestratorTestTimeoutMs,
	);

	test('records a feature completed outside prioritized work as an overrun', async () => {
		const store = await makeStore('outside-prioritized-work');
		await addFeature(store, 'feature-extra', 2);
		const runtimePlan = resolveRunPlan(
			parseArgs([
				'--project-dir',
				store.projectDir,
				'--cli',
				'native',
				'--filter-by',
				'id',
				'--filter',
				'feature-core',
			]),
			config,
		);
		const exitCode = await runOrchestrator(runtimePlan, {
			rootDir,
			store,
			backend: new FakeBackend(
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"featureId":"feature-extra","status":"completed","passes":true}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				() => completeFeature(store, 'feature-extra'),
			),
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		const iteration = JSON.parse(
			await readFile(join(store.metadataDir, 'iterations', '001.json'), 'utf8'),
		) as {
			completedFeature: string | null;
			extraCompletedFeatures: string[];
			scopeOverrun: boolean;
		};
		expect(iteration.completedFeature).toBeNull();
		expect(iteration.extraCompletedFeatures).toEqual(['feature-extra']);
		expect(iteration.scopeOverrun).toBe(true);
	});

	test(
		'never commits the run ledger, leaving only the agent-attributed commit',
		async () => {
			const store = await makeStore('run-ledger-commit');
			await writeFile(join(store.projectDir, '.gitignore'), '.aidd/iterations/\n');
			await initializeGitProject(store.projectDir);
			const exitCode = await runOrchestrator(gitHeavyPlan(store.projectDir), {
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
					},
				),
			});

			expect(exitCode).toBe(orchestratorExitCodes.success);
			const runSummary = JSON.parse(
				(await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8')).trim(),
			) as {
				commitsCreated: { hash: string; subject: string }[];
				runLedgerDirty: boolean;
			};
			expect(runSummary.commitsCreated).toHaveLength(1);
			expect(runSummary.commitsCreated[0]?.subject).toBe('feat: complete feature');
			expect(runSummary.runLedgerDirty).toBe(false);
			// HEAD is the agent's own commit. aidd adds no follow-up ledger commit on top: the
			// ledger is raw run output that may carry sensitive strings and is never committed.
			const headSubject = (
				await gitText(store.projectDir, ['log', '-1', '--format=%s'])
			).trim();
			expect(headSubject).toBe('feat: complete feature');
			// The attributed hash is reachable because nothing rewrote or followed it.
			const recordedHash = runSummary.commitsCreated[0]?.hash ?? '';
			const headHash = (await gitText(store.projectDir, ['rev-parse', 'HEAD'])).trim();
			expect(recordedHash).toBe(headHash);
			// .aidd/runs.jsonl is absent from the committed tree. This fixture's .gitignore covers
			// only iterations/, so the ledger shows as untracked dirt rather than a commit.
			const tracked = await gitText(store.projectDir, ['ls-files', '.aidd/runs.jsonl']);
			expect(tracked.trim()).toBe('');
		},
		slowOrchestratorTestTimeoutMs,
	);

	test(
		'attributes the initializer scaffold commit and records the ledger on a fresh git init',
		async () => {
			const store = await makeStore('initializer-fresh-git-init');
			// Fresh `git init` with NO initial commit — the initializer phase's starting point
			// and the exact case that left gitHeadBefore undefined, so listGitCommits returned [].
			const init = Bun.spawn(['git', 'init', store.projectDir], {
				stderr: 'pipe',
				stdout: 'pipe',
				windowsHide: true,
			});
			expect(await init.exited).toBe(0);
			await runGit(store.projectDir, ['config', 'user.email', 'aidd-test@example.invalid']);
			await runGit(store.projectDir, ['config', 'user.name', 'aidd Test']);

			const initPlan = gitHeavyPlan(store.projectDir);
			initPlan.stopBeforeImplementation = true;
			initPlan.prompt.phase = 'initializer';
			initPlan.prompt.fragments = initPlan.prompt.fragments.map((fragment) =>
				fragment.kind === 'phase'
					? { kind: 'phase', id: 'initializer', path: 'prompts/initializer.md' }
					: fragment,
			);

			// The initializer emits no AIDD_RESULT marker and completes no backlog feature; it
			// only scaffolds the project and lands the first commit.
			const exitCode = await runOrchestrator(initPlan, {
				rootDir,
				store,
				backend: new FakeBackend(
					[{ type: 'done', exitCode: 0, filesModified: [] }],
					async () => {
						// Mirrors a complete blueprint: the ledger is ignored, so it never dirties
						// the worktree and aidd never has cause to commit it.
						await writeFile(
							join(store.projectDir, '.gitignore'),
							'.aidd/iterations/\n.aidd/runs.jsonl\n',
						);
						await writeFile(join(store.metadataDir, 'spec.md'), '# Spec\n');
						await writeFile(join(store.metadataDir, 'CHANGELOG.md'), '# Changelog\n');
						await store.writeRoadmap({
							features: { 'feature-core': { milestone: 'MVP' } },
							milestones: { MVP: { priority: 1 } },
						});
						await runGit(store.projectDir, ['add', '.']);
						await runGit(store.projectDir, [
							'commit',
							'-m',
							'chore: complete initialization',
						]);
					},
				),
			});

			expect(exitCode).toBe(orchestratorExitCodes.success);
			const status = await gitText(store.projectDir, [
				'status',
				'--porcelain=v1',
				'--untracked-files=all',
			]);
			expect(status.trim()).toBe('');
			const runSummary = JSON.parse(
				(await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8')).trim(),
			) as {
				commitsCreated: { hash: string; subject: string }[];
				mode: string;
				phase: string;
				runLedgerDirty: boolean;
				stopReason: string;
				exitCode: number;
			};
			// The scaffold commit is attributed (not exit 73), and the ignored ledger leaves the
			// worktree clean without aidd committing anything.
			expect(runSummary.commitsCreated).toHaveLength(1);
			expect(runSummary.commitsCreated[0]?.subject).toBe('chore: complete initialization');
			expect(runSummary.runLedgerDirty).toBe(false);
			expect(runSummary.stopReason).not.toBe('exit_error');
			expect(runSummary.exitCode).toBe(orchestratorExitCodes.success);
			// The initializer phase is a phase inside coding mode; the run ledger records the
			// phase so run history no longer mislabels initialization as a plain coding run.
			expect(runSummary.phase).toBe('initializer');
			expect(runSummary.mode).toBe('coding');
			// HEAD is the agent's scaffold commit: aidd adds no ledger commit on top of it, so the
			// recorded hash is HEAD itself rather than an ancestor behind a follow-up.
			const headSubject = (
				await gitText(store.projectDir, ['log', '-1', '--format=%s'])
			).trim();
			expect(headSubject).toBe('chore: complete initialization');
			const recordedHash = runSummary.commitsCreated[0]?.hash ?? '';
			const headHash = (await gitText(store.projectDir, ['rev-parse', 'HEAD'])).trim();
			expect(recordedHash).toBe(headHash);
			expect((await gitText(store.projectDir, ['ls-files', '.aidd/runs.jsonl'])).trim()).toBe(
				'',
			);
		},
		slowOrchestratorTestTimeoutMs,
	);

	test(
		'reverts metadata-only completion when backend exits before committing',
		async () => {
			const store = await makeStore('completion-pending-commit-on-exit');
			await writeFile(join(store.projectDir, '.gitignore'), '.aidd/iterations/\n');
			await initializeGitProject(store.projectDir);

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

			await runOrchestrator(plan(store.projectDir), {
				rootDir,
				store,
				backend,
				completionMarkerGraceMs: 10,
			});

			const parked = await store.readFeature('feature-core');
			expect(parked).toMatchObject({
				status: 'waiting_approval',
				passes: false,
			});
			// The failing-gate context is persisted onto the parked feature so the decision queue
			// (and the next run) can see WHY it bounced instead of approving blind.
			expect(parked.blockingContext).toMatchObject({
				outcomeStatus: 'completion_pending_commit',
				reason: 'completion_pending_commit',
			});
			expect(Array.isArray(parked.blockingContext?.commands)).toBe(true);
			expect(typeof parked.blockingContext?.parkedAt).toBe('string');
			const iterationJson = await readFile(
				join(store.metadataDir, 'iterations', '001.json'),
				'utf8',
			);
			expect(iterationJson).toContain('"completionPendingCommit": true');
			expect(iterationJson).toContain('"backendCompletionFinalizedEarly": true');
			const runSummary = JSON.parse(
				(await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8')).trim(),
			) as { completedFeatures: string[]; commitsCreated: { hash: string }[] };
			expect(runSummary.completedFeatures).not.toContain('feature-core');
			expect(runSummary.commitsCreated).toHaveLength(0);
		},
		slowOrchestratorTestTimeoutMs,
	);

	test(
		'accepts ignored metadata-only completion without forcing a commit',
		async () => {
			const store = await makeStore('ignored-metadata-completion');
			await writeFile(join(store.projectDir, '.gitignore'), '.aidd/\n');
			await initializeGitProject(store.projectDir);

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

			const exitCode = await runOrchestrator(plan(store.projectDir), {
				rootDir,
				store,
				backend,
				completionMarkerGraceMs: 10,
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
			expect(iterationJson).toContain('"completedFeature": "feature-core"');
			expect(iterationJson).not.toContain('"completionPendingCommit": true');
			const runSummary = JSON.parse(
				(await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8')).trim(),
			) as { completedFeatures: string[]; commitsCreated: { hash: string }[] };
			expect(runSummary.completedFeatures).toContain('feature-core');
			expect(runSummary.commitsCreated).toHaveLength(0);
		},
		slowOrchestratorTestTimeoutMs,
	);

	test(
		'still requires a commit when ignored metadata completes alongside uncommitted source',
		async () => {
			const store = await makeStore('ignored-metadata-dirty-source');
			await writeFile(join(store.projectDir, '.gitignore'), '.aidd/\n');
			await initializeGitProject(store.projectDir);

			// Same ignored-.aidd setup as the accepting case, but the run also leaves a source file
			// uncommitted. The ignored-metadata allowance must not extend to source work: the only
			// dirt it may excuse is what was already dirty at run start.
			const backend = new FakeBackend(
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				async () => {
					await writeFile(
						join(store.projectDir, 'src-change.ts'),
						'export const x = 1;\n',
					);
					await completeFeature(store, 'feature-core');
				},
			);

			await runOrchestrator(plan(store.projectDir), {
				rootDir,
				store,
				backend,
				completionMarkerGraceMs: 10,
			});

			await expect(store.readFeature('feature-core')).resolves.toMatchObject({
				status: 'waiting_approval',
				passes: false,
			});
			const iterationJson = await readFile(
				join(store.metadataDir, 'iterations', '001.json'),
				'utf8',
			);
			expect(iterationJson).toContain('"completionPendingCommit": true');
			const runSummary = JSON.parse(
				(await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8')).trim(),
			) as { completedFeatures: string[]; commitsCreated: { hash: string }[] };
			expect(runSummary.completedFeatures).not.toContain('feature-core');
			expect(runSummary.commitsCreated).toHaveLength(0);
		},
		slowOrchestratorTestTimeoutMs,
	);

	test(
		'still requires a commit when the run edits a file that was already dirty at start',
		async () => {
			const store = await makeStore('ignored-metadata-rewrites-dirty-source');
			await writeFile(join(store.projectDir, '.gitignore'), '.aidd/\n');
			await initializeGitProject(store.projectDir);
			// Pre-existing operator dirt: present in the run-start baseline, so path membership alone
			// would excuse it. The run then edits that very file, which makes the leftover edit the
			// run's own uncommitted source work rather than operator state.
			await writeFile(join(store.projectDir, 'operator-wip.ts'), 'export const wip = 0;\n');

			const backend = new FakeBackend(
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				async () => {
					await writeFile(
						join(store.projectDir, 'operator-wip.ts'),
						'export const wip = 1;\n',
					);
					await completeFeature(store, 'feature-core');
				},
			);

			await runOrchestrator(plan(store.projectDir), {
				rootDir,
				store,
				backend,
				completionMarkerGraceMs: 10,
			});

			await expect(store.readFeature('feature-core')).resolves.toMatchObject({
				status: 'waiting_approval',
				passes: false,
			});
			const iterationJson = await readFile(
				join(store.metadataDir, 'iterations', '001.json'),
				'utf8',
			);
			expect(iterationJson).toContain('"completionPendingCommit": true');
		},
		slowOrchestratorTestTimeoutMs,
	);

	test(
		'reverts abort-time completion when feature.json is flipped after the marker and never committed',
		async () => {
			const store = await makeStore('completion-pending-commit-on-abort');
			await writeFile(join(store.projectDir, '.gitignore'), '.aidd/iterations/\n');
			await initializeGitProject(store.projectDir);

			// The AIDD_RESULT marker streams BEFORE feature.json is flipped to completed, so the
			// per-assistant_text acceptance check sees an incomplete feature and the commit-grace
			// machinery never engages during streaming. The backend is then aborted between the
			// (late) completion write and any commit. Without the backend-exit re-check the
			// completed_after_backend_abort path would accept passes:true with uncommitted work.
			const lateCompleteBackend: CLIBackend = {
				name: 'native' as const,
				idleDefaults: { nudgeMs: 10, killMs: 20 },
				async *runPrompt(): AsyncIterable<AgentEvent> {
					yield {
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
					};
					await completeFeature(store, 'feature-core');
					yield { type: 'error', reason: 'aborted', meta: 'stop requested' };
				},
			};

			await runOrchestrator(plan(store.projectDir), {
				rootDir,
				store,
				backend: lateCompleteBackend,
				completionMarkerGraceMs: 10,
			});

			await expect(store.readFeature('feature-core')).resolves.toMatchObject({
				status: 'waiting_approval',
				passes: false,
			});
			const iterationJson = await readFile(
				join(store.metadataDir, 'iterations', '001.json'),
				'utf8',
			);
			expect(iterationJson).toContain('"completionPendingCommit": true');
			const runSummary = JSON.parse(
				(await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8')).trim(),
			) as { completedFeatures: string[]; commitsCreated: { hash: string }[] };
			expect(runSummary.completedFeatures).not.toContain('feature-core');
			expect(runSummary.commitsCreated).toHaveLength(0);
		},
		slowOrchestratorTestTimeoutMs,
	);

	test(
		'accepts abort-time completion when the feature commit landed before the abort',
		async () => {
			const store = await makeStore('completion-committed-before-abort');
			await writeFile(join(store.projectDir, '.gitignore'), '.aidd/iterations/\n');
			await initializeGitProject(store.projectDir);

			// Same late-completion ordering, but the agent commits the feature work before the
			// abort. The commit-landed gate must let this through and complete as today.
			const committedBackend: CLIBackend = {
				name: 'native' as const,
				idleDefaults: { nudgeMs: 10, killMs: 20 },
				async *runPrompt(): AsyncIterable<AgentEvent> {
					yield {
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
					};
					await completeFeature(store, 'feature-core');
					await runGit(store.projectDir, [
						'add',
						'.aidd/features/feature-core/feature.json',
					]);
					await runGit(store.projectDir, ['commit', '-m', 'feat: complete feature']);
					yield { type: 'error', reason: 'aborted', meta: 'stop requested' };
				},
			};

			const exitCode = await runOrchestrator(plan(store.projectDir), {
				rootDir,
				store,
				backend: committedBackend,
				completionMarkerGraceMs: 10,
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
			expect(iterationJson).toContain('"completedFeature": "feature-core"');
			expect(iterationJson).not.toContain('"completionPendingCommit": true');
		},
		slowOrchestratorTestTimeoutMs,
	);

	test(
		'does not attribute orphaned recovery commits to a later run',
		async () => {
			const store = await makeStore('orphan-commit-attribution');
			await writeFile(join(store.projectDir, '.gitignore'), '.aidd/iterations/\n');
			await mkdir(join(store.projectDir, '.aidd', 'features', 'orphan-feature'), {
				recursive: true,
			});
			await writeFile(
				join(store.projectDir, '.aidd', 'features', 'orphan-feature', 'feature.json'),
				JSON.stringify({
					id: 'orphan-feature',
					title: 'Orphaned feature',
					status: 'completed',
					passes: true,
					priority: 2,
				}),
			);
			await initializeGitProject(store.projectDir);
			// Leftover uncommitted work from an earlier orphaned/recovery iteration whose run
			// ledger row was never written. It belongs to orphan-feature, not this run.
			await writeFile(
				join(store.projectDir, '.aidd', 'features', 'orphan-feature', 'feature.json'),
				JSON.stringify({
					id: 'orphan-feature',
					title: 'Orphaned feature',
					status: 'completed',
					passes: true,
					priority: 2,
					note: 'leftover edit',
				}),
			);

			const exitCode = await runOrchestrator(gitHeavyPlan(store.projectDir), {
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
						await runGit(store.projectDir, [
							'commit',
							'-m',
							'feat: complete feature-core',
						]);
						// The agent sweeps the leftover orphan-feature edit into a commit.
						await runGit(store.projectDir, [
							'add',
							'.aidd/features/orphan-feature/feature.json',
						]);
						await runGit(store.projectDir, [
							'commit',
							'-m',
							'chore: sweep leftover orphan work',
						]);
						await writeFile(join(store.projectDir, 'README.md'), '# readme\n');
						await runGit(store.projectDir, ['add', 'README.md']);
						await runGit(store.projectDir, ['commit', '-m', 'docs: add readme']);
					},
				),
			});

			expect(exitCode).toBe(orchestratorExitCodes.success);
			const runSummary = JSON.parse(
				(await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8')).trim(),
			) as {
				commitsCreated: { hash: string; subject: string }[];
				completedFeatures: string[];
			};
			const subjects = runSummary.commitsCreated.map((commit) => commit.subject);
			expect(subjects).toContain('feat: complete feature-core');
			expect(subjects).toContain('docs: add readme');
			expect(subjects).not.toContain('chore: sweep leftover orphan work');
			expect(runSummary.completedFeatures).not.toContain('orphan-feature');
		},
		slowOrchestratorTestTimeoutMs,
	);

	test(
		'records explicit file-change counts instead of backend filesModified',
		async () => {
			const store = await makeStore('file-change-metrics');
			await writeFile(join(store.projectDir, '.gitignore'), '.aidd/iterations/\n');
			await initializeGitProject(store.projectDir);

			const exitCode = await runOrchestrator(gitHeavyPlan(store.projectDir), {
				rootDir,
				store,
				backend: new FakeBackend(
					[
						{
							type: 'assistant_text',
							chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
						},
						{ type: 'tool_call', tool: 'Edit', args: { file_path: 'src/a.ts' } },
						{ type: 'tool_call', tool: 'Edit', args: { file_path: 'src/a.ts' } },
						{ type: 'tool_call', tool: 'Write', args: { file_path: 'src/b.ts' } },
						{ type: 'done', exitCode: 0, filesModified: ['ignored-by-design.ts'] },
					],
					async () => {
						await completeFeature(store, 'feature-core');
						await runGit(store.projectDir, [
							'add',
							'.aidd/features/feature-core/feature.json',
						]);
						await runGit(store.projectDir, [
							'commit',
							'-m',
							'feat: complete feature-core',
						]);
						await writeFile(join(store.projectDir, 'residual.txt'), 'uncommitted\n');
					},
				),
			});

			expect(exitCode).toBe(orchestratorExitCodes.success);
			const structured = JSON.parse(
				await readFile(join(store.metadataDir, 'iterations', '001.json'), 'utf8'),
			) as Record<string, unknown>;
			expect(structured).toMatchObject({
				commitsCreatedCount: 1,
				filesCreatedCount: 1,
				filesEditedCount: 1,
			});
			expect(structured).not.toHaveProperty('filesModified');
			expect(structured.residualDirtyFilesCount as number).toBeGreaterThanOrEqual(1);
		},
		slowOrchestratorTestTimeoutMs,
	);

	test(
		'audit-created metadata files are included in iteration and run file changes',
		async () => {
			const store = await makeStore('audit-metadata-file-changes');
			const reportDate = new Date().toISOString().slice(0, 10);
			const exitCode = await runOrchestrator(
				plan(store.projectDir, ['--audit', 'SECURITY']),
				{
					rootDir,
					store,
					backend: new FakeBackend([
						{
							type: 'assistant_text',
							chunk: [
								'AIDD_RESULT: ',
								JSON.stringify({
									auditFindings: [
										{
											affectedFiles: ['src/routes.ts'],
											description:
												'Verified: src/routes.ts:12 lacks a guard.',
											severity: 'High',
											spec: 'Add the missing guard.',
											title: 'Missing route guard',
										},
									],
									reportMarkdown: '# SECURITY Audit Report\n\nOne finding.',
								}),
								'\n',
							].join(''),
						},
						{ type: 'done', exitCode: 0, filesModified: [] },
					]),
				},
			);

			expect(exitCode).toBe(orchestratorExitCodes.success);
			const runSummary = JSON.parse(
				(await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8')).trim(),
			) as {
				filesCreated: string[];
				filesEdited: string[];
				totals: { filesCreated: number; filesEdited: number };
			};
			const structured = JSON.parse(
				await readFile(join(store.metadataDir, 'iterations', '001.json'), 'utf8'),
			) as {
				filesCreated: string[];
				filesCreatedCount: number;
				filesEdited: string[];
				filesEditedCount: number;
			};
			const createdFeaturePath = runSummary.filesCreated.find((path) =>
				path.includes(join('.aidd', 'features', 'audit-security-')),
			);

			expect(createdFeaturePath).toBeDefined();
			expect(runSummary.filesCreated).toContain(
				join(store.metadataDir, 'audit-reports', `SECURITY-${reportDate}.md`),
			);
			expect(runSummary.totals.filesCreated).toBe(runSummary.filesCreated.length);
			expect(runSummary.totals.filesEdited).toBe(runSummary.filesEdited.length);
			expect(structured.filesCreated).toEqual(runSummary.filesCreated);
			expect(structured.filesEdited).toEqual(runSummary.filesEdited);
			expect(structured.filesCreatedCount).toBe(runSummary.filesCreated.length);
			expect(structured.filesEditedCount).toBe(runSummary.filesEdited.length);
		},
		slowOrchestratorTestTimeoutMs,
	);

	test('marks selected todo complete from explicit structured agent result', async () => {
		const store = await makeStore('todo-result');
		await writeFile(
			join(store.metadataDir, 'todo.md'),
			'- [ ] first task\n- [ ] second task\n',
		);
		const exitCode = await runOrchestrator(plan(store.projectDir, ['--todo']), {
			rootDir,
			store,
			backend: new FakeBackend([
				{ type: 'assistant_text', chunk: 'AIDD_RESULT: {"todoCompleted":true}\n' },
				{ type: 'done', exitCode: 0, filesModified: [] },
			]),
		});

		const todo = await readFile(join(store.metadataDir, 'todo.md'), 'utf8');
		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(todo).toContain('- [x] first task');
		expect(todo).toContain('- [ ] second task');
	});
});
