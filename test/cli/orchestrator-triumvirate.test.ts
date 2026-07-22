import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'aidd-shared/args/index';
import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';

import { runOrchestrator } from '../../cli/src/orchestrator/orchestrator.ts';
import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';
import {
	FakeBackend,
	SequencedBackend,
	captureStdout,
	config,
	completeFeature,
	createOrchestratorTestContext,
	gitHeavyPlan,
	gitText,
	initializeGitProject,
	plan,
	rootDir,
	runGit,
	slowOrchestratorTestTimeoutMs,
} from './_helpers/orchestrator-fixture.ts';

const { cleanup, makeStore } = createOrchestratorTestContext('triumvirate');

afterEach(cleanup);

describe('orchestrator triumvirate', () => {
	test('triumvirate runs primary, secondary, overseer, then execution', async () => {
		const store = await makeStore('triumvirate-order');
		const backend = new SequencedBackend(
			[
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"planMarkdown":"Primary plan"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"planMarkdown":"Secondary plan"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"decision":"execute","finalActions":"Implement the approved path."}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: ['x.ts'] },
				],
			],
			async (callIndex) => {
				if (callIndex === 3) await completeFeature(store, 'feature-core');
			}
		);
		const runtimePlan = plan(store.projectDir, [
			'--triumvirate',
			'--secondary-cli',
			'native',
			'--overseer-cli',
			'native',
			'--exec-cli',
			'native',
			'--exec-model',
			'exec-model',
		]);

		let exitCode = -1;
		const output = await captureStdout(async () => {
			exitCode = await runOrchestrator(runtimePlan, {
				backend,
				backendFactory: () => backend,
				rootDir,
				store,
			});
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(output).toContain('triumvirate primary waiting for backend');
		expect(output).toContain('triumvirate secondary waiting for backend');
		expect(output).toContain('triumvirate overseer waiting for backend');
		expect(output).toContain('triumvirate execution waiting for backend');
		expect(output).toContain('triumvirate process result');
		expect(output).toContain('triumvirate iteration complete');
		expect(backend.calls).toBe(4);
		expect(backend.inputs[0]?.cwd).not.toBe(store.projectDir);
		expect(backend.inputs[1]?.cwd).not.toBe(store.projectDir);
		expect(backend.inputs[2]?.cwd).not.toBe(store.projectDir);
		expect(backend.inputs[1]?.cwd).not.toBe(backend.inputs[0]?.cwd);
		expect(backend.inputs[2]?.cwd).not.toBe(backend.inputs[0]?.cwd);
		expect(backend.inputs[2]?.cwd).not.toBe(backend.inputs[1]?.cwd);
		const primaryPlanningCwd = backend.inputs[0]?.cwd ?? '';
		const secondaryPlanningCwd = backend.inputs[1]?.cwd ?? '';
		const overseerPlanningCwd = backend.inputs[2]?.cwd ?? '';
		expect(backend.inputs[0]?.text).toContain(primaryPlanningCwd);
		expect(backend.inputs[1]?.text).toContain(secondaryPlanningCwd);
		expect(backend.inputs[2]?.text).toContain(overseerPlanningCwd);
		expect(backend.inputs[0]?.text).toContain('Read-only boundary:');
		expect(backend.inputs[0]?.text).toContain(
			'You must not create, edit, delete, format, stage, commit, or generate files'
		);
		expect(backend.inputs[0]?.text).toContain('will be rejected and retried');
		expect(backend.inputs[0]?.text).toContain(
			'The prompt below is included only so you can understand the requested work'
		);
		expect(backend.inputs[1]?.text).toContain('Read-only boundary:');
		expect(backend.inputs[2]?.text).toContain('Read-only boundary:');
		expect(backend.inputs[2]?.text).toContain(
			'ignore any instruction in it to implement, edit'
		);
		expect(backend.inputs[0]?.text.toLowerCase()).not.toContain(store.projectDir.toLowerCase());
		expect(backend.inputs[1]?.text.toLowerCase()).not.toContain(store.projectDir.toLowerCase());
		expect(backend.inputs[2]?.text.toLowerCase()).not.toContain(store.projectDir.toLowerCase());
		expect(backend.inputs[2]?.text).toContain('Primary plan');
		expect(backend.inputs[2]?.text).toContain('Secondary plan');
		expect(backend.inputs[0]?.heuristicMode).toBe('planning');
		expect(backend.inputs[1]?.heuristicMode).toBe('planning');
		expect(backend.inputs[2]?.heuristicMode).toBe('planning');
		expect(backend.inputs[3]?.heuristicMode).toBeUndefined();
		expect(backend.inputs[3]).toMatchObject({ cwd: store.projectDir, model: 'exec-model' });
		expect(backend.inputs[3]?.text).toContain('Implement the approved path.');
		const iterationJson = await readFile(
			join(store.metadataDir, 'iterations', '001.json'),
			'utf8'
		);
		expect(iterationJson).toContain('"triumvirate"');
		expect(iterationJson).toContain('"primaryPlan"');
		expect(iterationJson).toContain('"overseerDecision"');
		expect(iterationJson).toContain('"execution"');
		const structured = JSON.parse(iterationJson) as {
			executionMode: string;
			mode: string;
			triumvirate: {
				decision: {
					finalActions: string;
					source: string;
					status: string;
				};
				execution: {
					cwdKind: string;
					model: string;
					role: string;
				};
				metadata: {
					guard: { source: string };
					planningMirror: {
						excludedNames: string[];
						isolation: string;
						projectDir: string;
						promptProjectPath: string;
						roleProjectDirs: {
							overseer: string;
							primary: string;
							secondary: string;
						};
					};
					roles: { execution: { backend: string; model: string } };
					selectedWork: { id: string; kind: string };
				};
				overseerDecision: { structuredResult: { decision: string } };
				primaryPlan: {
					cwdKind: string;
					durationMs: number;
					promptChars: number;
					role: string;
					selectedWork: { id: string };
					stage: string;
					startedAt: string;
				};
			};
			triumvirateRoles: {
				execution: { backend: string; model: string };
				overseer: { backend: string };
				primary: { backend: string };
				secondary: { backend: string };
			};
		};
		expect(structured.mode).toBe('coding');
		expect(structured.executionMode).toBe('triumvirate');
		expect(structured.triumvirateRoles.execution).toEqual({
			backend: 'native',
			model: 'exec-model',
		});
		expect(structured.triumvirate.metadata.selectedWork).toMatchObject({
			id: 'feature-core',
			kind: 'feature',
		});
		expect(structured.triumvirate.metadata.roles.execution).toMatchObject({
			backend: 'native',
			model: 'exec-model',
		});
		expect(structured.triumvirate.metadata.guard.source).toBe(
			'git status --porcelain=v1 --untracked-files=all'
		);
		expect(structured.triumvirate.metadata.planningMirror.excludedNames).toContain('data');
		expect(structured.triumvirate.metadata.planningMirror).toMatchObject({
			isolation: 'per_role',
			projectDir: primaryPlanningCwd,
			promptProjectPath: 'rewritten_to_role_planning_mirror',
			roleProjectDirs: {
				overseer: overseerPlanningCwd,
				primary: primaryPlanningCwd,
				secondary: secondaryPlanningCwd,
			},
		});
		expect(structured.triumvirate.primaryPlan).toMatchObject({
			cwdKind: 'planning_mirror',
			role: 'primary',
			selectedWork: { id: 'feature-core', kind: 'feature' },
			stage: 'primary',
		});
		expect(structured.triumvirate.primaryPlan.promptChars).toBeGreaterThan(0);
		expect(structured.triumvirate.primaryPlan.durationMs).toBeGreaterThanOrEqual(0);
		expect(structured.triumvirate.primaryPlan.startedAt).toContain('T');
		expect(structured.triumvirate.overseerDecision.structuredResult.decision).toBe('execute');
		expect(structured.triumvirate.decision).toMatchObject({
			finalActions: 'Implement the approved path.',
			source: 'overseer.AIDD_RESULT',
			status: 'execute',
		});
		expect(structured.triumvirate.execution).toMatchObject({
			cwdKind: 'project',
			model: 'exec-model',
			role: 'execution',
		});
		const runs = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
		expect(runs).toContain('"executionMode":"triumvirate"');
		expect(runs).toContain('"triumvirateRoles"');
	});

	test('complexity tiering: a low-complexity feature skips secondary + overseer', async () => {
		const store = await makeStore('triumvirate-low-tier');
		const backend = new SequencedBackend(
			[
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"planMarkdown":"Primary plan"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: ['x.ts'] },
				],
			],
			async (callIndex) => {
				if (callIndex === 1) await completeFeature(store, 'feature-core');
			}
		);
		const runtimePlan = plan(store.projectDir, [
			'--triumvirate',
			'--secondary-cli',
			'native',
			'--overseer-cli',
			'native',
			'--complexity-tiering',
		]);

		let exitCode = -1;
		const output = await captureStdout(async () => {
			exitCode = await runOrchestrator(runtimePlan, {
				backend,
				backendFactory: () => backend,
				rootDir,
				store,
			});
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		// Only two backend calls: primary planner, then execution. Secondary + overseer skipped.
		expect(backend.calls).toBe(2);
		expect(output).toContain('triumvirate primary waiting for backend');
		expect(output).toContain('triumvirate execution waiting for backend');
		expect(output).not.toContain('triumvirate secondary waiting for backend');
		expect(output).not.toContain('triumvirate overseer waiting for backend');
		// Execution runs against the real project tree using the primary plan.
		expect(backend.inputs[1]).toMatchObject({ cwd: store.projectDir });
		const iterationJson = await readFile(
			join(store.metadataDir, 'iterations', '001.json'),
			'utf8'
		);
		const structured = JSON.parse(iterationJson) as {
			triumvirate: { complexityTier: string; skippedStages: string[] };
		};
		expect(structured.triumvirate.complexityTier).toBe('low');
		expect(structured.triumvirate.skippedStages).toEqual(['secondary', 'overseer']);
	});

	test('consistency gate: overseer checks the plan and execution receives flagged issues', async () => {
		const store = await makeStore('triumvirate-consistency');
		const backend = new SequencedBackend(
			[
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"planMarkdown":"Primary plan"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"planMarkdown":"Secondary plan"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"decision":"execute","finalActions":"Implement the approved path.","consistencyIssues":["assertion A is unmet"]}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: ['x.ts'] },
				],
			],
			async (callIndex) => {
				if (callIndex === 3) await completeFeature(store, 'feature-core');
			}
		);
		const runtimePlan = plan(store.projectDir, [
			'--triumvirate',
			'--secondary-cli',
			'native',
			'--overseer-cli',
			'native',
			'--consistency-gate',
		]);

		let exitCode = -1;
		await captureStdout(async () => {
			exitCode = await runOrchestrator(runtimePlan, {
				backend,
				backendFactory: () => backend,
				rootDir,
				store,
			});
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(backend.calls).toBe(4);
		// The overseer prompt instructs the consistency check against spec/assertions/feature.
		expect(backend.inputs[2]?.text).toContain('CONSISTENCY CHECK');
		// The execution prompt carries the overseer's flagged issue forward as a must-address note.
		expect(backend.inputs[3]?.text).toContain('CONSISTENCY NOTES');
		expect(backend.inputs[3]?.text).toContain('assertion A is unmet');
	});

	test('triumvirate uses overseer identity for execution when exec cli is omitted', async () => {
		const store = await makeStore('triumvirate-overseer-exec');
		const backend = new SequencedBackend(
			[
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"planMarkdown":"Primary plan"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"planMarkdown":"Secondary plan"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"decision":"execute","finalActions":"Implement as overseer."}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: ['x.ts'] },
				],
			],
			async (callIndex) => {
				if (callIndex === 3) await completeFeature(store, 'feature-core');
			}
		);
		const runtimePlan = plan(store.projectDir, [
			'--triumvirate',
			'--secondary-cli',
			'native',
			'--overseer-cli',
			'opencode',
			'--overseer-model',
			'overseer-model',
		]);

		const exitCode = await runOrchestrator(runtimePlan, {
			backend,
			backendFactory: () => backend,
			rootDir,
			store,
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(backend.calls).toBe(4);
		expect(backend.inputs[2]?.heuristicMode).toBe('planning');
		expect(backend.inputs[3]).toMatchObject({
			cwd: store.projectDir,
			model: 'overseer-model',
		});
		expect(backend.inputs[3]?.heuristicMode).toBeUndefined();
		expect(backend.inputs[3]?.text).toContain('Implement as overseer.');
		const iterationJson = await readFile(
			join(store.metadataDir, 'iterations', '001.json'),
			'utf8'
		);
		const structured = JSON.parse(iterationJson) as {
			triumvirate: {
				execution: {
					backend: string;
					cwdKind: string;
					model: string;
					role: string;
				};
				metadata: {
					roles: {
						execution: { backend: string; model: string };
						overseer: { backend: string; model: string };
					};
				};
			};
		};
		expect(structured.triumvirate.metadata.roles.overseer).toEqual({
			backend: 'opencode',
			model: 'overseer-model',
		});
		expect(structured.triumvirate.metadata.roles.execution).toEqual({
			backend: 'opencode',
			model: 'overseer-model',
		});
		expect(structured.triumvirate.execution).toMatchObject({
			backend: 'opencode',
			cwdKind: 'project',
			model: 'overseer-model',
			role: 'execution',
		});
	});

	test('triumvirate isolates planner mirrors between planning roles', async () => {
		const store = await makeStore('triumvirate-isolated-planners');
		let secondarySawPrimaryFile = false;
		const backend = new SequencedBackend(
			[
				[
					{ type: 'assistant_text', chunk: 'AIDD_RESULT: {"planMarkdown":"Primary"}\n' },
					{ type: 'done', exitCode: 0, filesModified: ['primary-only.txt'] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"planMarkdown":"Primary retry"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"planMarkdown":"Secondary"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"decision":"execute","finalActions":"Implement"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: ['x.ts'] },
				],
			],
			async (callIndex, input) => {
				if (callIndex === 0) {
					await writeFile(join(input.cwd, 'primary-only.txt'), 'primary mutation\n');
					return;
				}
				if (callIndex === 2) {
					try {
						await readFile(join(input.cwd, 'primary-only.txt'), 'utf8');
						secondarySawPrimaryFile = true;
					} catch {
						secondarySawPrimaryFile = false;
					}
					return;
				}
				if (callIndex === 4) await completeFeature(store, 'feature-core');
			}
		);
		const runtimePlan = plan(store.projectDir, [
			'--triumvirate',
			'--secondary-cli',
			'native',
			'--overseer-cli',
			'native',
			'--exec-cli',
			'native',
		]);

		const exitCode = await runOrchestrator(runtimePlan, {
			backend,
			backendFactory: () => backend,
			rootDir,
			store,
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(secondarySawPrimaryFile).toBe(false);
		expect(backend.calls).toBe(5);
		expect(backend.inputs[1]?.cwd).toBe(backend.inputs[0]?.cwd);
		expect(backend.inputs[1]?.text).toContain('aidd PLANNING STAGE RETRY');
		expect(backend.inputs[2]?.cwd).not.toBe(backend.inputs[0]?.cwd);
		const iterationJson = await readFile(
			join(store.metadataDir, 'iterations', '001.json'),
			'utf8'
		);
		const structured = JSON.parse(iterationJson) as {
			triumvirate: {
				primaryPlan: {
					planningMirrorMutation?: unknown;
					planningMirrorRetry: {
						attempts: number;
						previousMutations: {
							changedPaths: string[];
							filesModifiedCount: number;
							role: string;
							stage: string;
							structuredResultEmitted: boolean;
						}[];
						reason: string;
					};
				};
				secondaryPlan: {
					planningMirrorMutation?: unknown;
				};
			};
			triumviratePlanningRecovery: {
				stages: {
					attempts: number;
					changedPaths: string[];
					stage: string;
				}[];
				status: string;
			};
			summary: string;
		};
		expect(structured.summary).toContain('planning_stage_mutation_recovered');
		expect(structured.triumviratePlanningRecovery).toEqual({
			stages: [
				{
					attempts: 2,
					changedPaths: ['primary-only.txt'],
					stage: 'primary',
				},
			],
			status: 'planning_stage_mutation_recovered',
		});
		expect(structured.triumvirate.primaryPlan.planningMirrorMutation).toBeUndefined();
		expect(structured.triumvirate.primaryPlan.planningMirrorRetry).toEqual({
			attempts: 2,
			previousMutations: [
				{
					changedPaths: ['primary-only.txt'],
					filesModifiedCount: 1,
					role: 'primary',
					stage: 'primary',
					structuredResultEmitted: true,
				},
			],
			reason: 'planning_mirror_mutation',
		});
		expect(structured.triumvirate.secondaryPlan.planningMirrorMutation).toBeUndefined();
		await expect(store.readFeature('feature-core')).resolves.toMatchObject({
			passes: true,
			status: 'completed',
		});
		const runs = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
		expect(runs).toContain('planning_stage_mutation_recovered');
	});

	test('triumvirate ignores generated planning mirror directories during mutation checks', async () => {
		const store = await makeStore('triumvirate-generated-dir-mutation');
		const backend = new SequencedBackend(
			[
				[
					{ type: 'assistant_text', chunk: 'AIDD_RESULT: {"planMarkdown":"Primary"}\n' },
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"planMarkdown":"Secondary"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"decision":"execute","finalActions":"Implement"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: ['x.ts'] },
				],
			],
			async (callIndex, input) => {
				if (callIndex === 0) {
					const packageDir = join(input.cwd, 'node_modules', 'generated-package');
					const distDir = join(input.cwd, 'frontend', 'dist', 'assets');
					await mkdir(packageDir, { recursive: true });
					await mkdir(distDir, { recursive: true });
					await writeFile(
						join(packageDir, 'index.js'),
						'export const generated = true;\n'
					);
					await writeFile(join(distDir, 'bundle.js'), 'console.log("generated");\n');
					return;
				}
				if (callIndex === 3) await completeFeature(store, 'feature-core');
			}
		);
		const runtimePlan = plan(store.projectDir, [
			'--triumvirate',
			'--secondary-cli',
			'native',
			'--overseer-cli',
			'native',
			'--exec-cli',
			'native',
		]);

		const exitCode = await runOrchestrator(runtimePlan, {
			backend,
			backendFactory: () => backend,
			rootDir,
			store,
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(backend.calls).toBe(4);
		expect(backend.inputs[1]?.text).not.toContain('aidd PLANNING STAGE RETRY');
		const iterationJson = await readFile(
			join(store.metadataDir, 'iterations', '001.json'),
			'utf8'
		);
		const structured = JSON.parse(iterationJson) as {
			triumvirate: {
				primaryPlan: {
					planningMirrorMutation?: unknown;
					planningMirrorRetry?: unknown;
				};
			};
		};
		expect(structured.triumvirate.primaryPlan.planningMirrorMutation).toBeUndefined();
		expect(structured.triumvirate.primaryPlan.planningMirrorRetry).toBeUndefined();
	});

	test('triumvirate caps large planning mirror mutation lists in retry prompts', async () => {
		const store = await makeStore('triumvirate-large-planning-mutation');
		const backend = new SequencedBackend(
			[
				[
					{ type: 'assistant_text', chunk: 'AIDD_RESULT: {"planMarkdown":"Primary"}\n' },
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"planMarkdown":"Primary retry"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"planMarkdown":"Secondary"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"decision":"execute","finalActions":"Implement"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: ['x.ts'] },
				],
			],
			async (callIndex, input) => {
				if (callIndex === 0) {
					const mutationDir = join(input.cwd, 'generated-mutations');
					await mkdir(mutationDir, { recursive: true });
					await Promise.all(
						Array.from({ length: 130 }, (_, index) =>
							writeFile(
								join(mutationDir, `mutation-${String(index).padStart(3, '0')}.txt`),
								`mutation ${index}\n`
							)
						)
					);
					return;
				}
				if (callIndex === 4) await completeFeature(store, 'feature-core');
			}
		);
		const runtimePlan = plan(store.projectDir, [
			'--triumvirate',
			'--secondary-cli',
			'native',
			'--overseer-cli',
			'native',
			'--exec-cli',
			'native',
		]);

		const exitCode = await runOrchestrator(runtimePlan, {
			backend,
			backendFactory: () => backend,
			rootDir,
			store,
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(backend.calls).toBe(5);
		expect(backend.inputs[1]?.text).toContain('aidd PLANNING STAGE RETRY');
		expect(backend.inputs[1]?.text).toContain('30 more path(s) omitted from prompt');
		expect(backend.inputs[1]?.text).toContain('Omitted changed-path groups:');
		expect(backend.inputs[1]?.text).toContain('- generated-mutations: 30');
		expect(backend.inputs[1]?.text).toContain('generated-mutations/mutation-099.txt');
		expect(backend.inputs[1]?.text).not.toContain('generated-mutations/mutation-129.txt');
		const iterationJson = await readFile(
			join(store.metadataDir, 'iterations', '001.json'),
			'utf8'
		);
		const structured = JSON.parse(iterationJson) as {
			triumvirate: {
				primaryPlan: {
					planningMirrorRetry: {
						previousMutations: {
							changedPaths: string[];
							filesModifiedCount: number;
						}[];
					};
				};
			};
		};
		expect(
			structured.triumvirate.primaryPlan.planningMirrorRetry.previousMutations[0]
				?.changedPaths
		).toHaveLength(130);
		expect(
			structured.triumvirate.primaryPlan.planningMirrorRetry.previousMutations[0]
				?.filesModifiedCount
		).toBe(130);
	});

	test('triumvirate overseer abort prevents execution', async () => {
		const store = await makeStore('triumvirate-abort');
		const backend = new SequencedBackend([
			[
				{ type: 'assistant_text', chunk: 'AIDD_RESULT: {"planMarkdown":"Primary"}\n' },
				{ type: 'done', exitCode: 0, filesModified: [] },
			],
			[
				{ type: 'assistant_text', chunk: 'AIDD_RESULT: {"planMarkdown":"Secondary"}\n' },
				{ type: 'done', exitCode: 0, filesModified: [] },
			],
			[
				{
					type: 'assistant_text',
					chunk: 'AIDD_RESULT: {"decision":"abort","reason":"Plans conflict"}\n',
				},
				{ type: 'done', exitCode: 0, filesModified: [] },
			],
		]);
		const runtimePlan = plan(store.projectDir, [
			'--triumvirate',
			'--secondary-cli',
			'native',
			'--overseer-cli',
			'native',
			'--exec-cli',
			'native',
		]);

		const exitCode = await runOrchestrator(runtimePlan, {
			backend,
			backendFactory: () => backend,
			rootDir,
			store,
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(backend.calls).toBe(3);
		await expect(store.readFeature('feature-core')).resolves.toMatchObject({
			passes: false,
			status: 'in_progress',
		});
		const runs = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
		expect(runs).toContain('"stopReason":"blocked"');
		expect(runs).toContain('Plans conflict');
		const iterationJson = await readFile(
			join(store.metadataDir, 'iterations', '001.json'),
			'utf8'
		);
		const structured = JSON.parse(iterationJson) as {
			triumvirate: {
				decision: { reason: string; status: string };
				execution?: unknown;
			};
		};
		expect(structured.triumvirate.decision).toMatchObject({
			reason: 'Plans conflict',
			status: 'abort',
		});
		expect(structured.triumvirate.execution).toBeUndefined();
	});

	test('triumvirate continues after transient primary provider errors by default', async () => {
		const store = await makeStore('triumvirate-transient-primary-provider-error');
		const backend = new SequencedBackend(
			[
				[
					{ type: 'tool_call', tool: 'edit', args: { file_path: 'src/partial.ts' } },
					{
						type: 'error',
						reason: 'provider',
						meta: 'zhipu request failed: HTTP 500 {"error":{"code":"1234","message":"Network error, please try again later"}}',
					},
				],
				[
					{ type: 'assistant_text', chunk: 'AIDD_RESULT: {"planMarkdown":"Primary"}\n' },
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"planMarkdown":"Secondary"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"decision":"execute","finalActions":"Implement"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
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
				if (callIndex === 4) await completeFeature(store, 'feature-core');
			}
		);
		const runtimePlan = plan(store.projectDir, [
			'--triumvirate',
			'--secondary-cli',
			'native',
			'--overseer-cli',
			'native',
			'--exec-cli',
			'native',
		]);

		const exitCode = await runOrchestrator(runtimePlan, {
			backend,
			backendFactory: () => backend,
			rootDir,
			store,
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(backend.calls).toBe(5);
		const firstIteration = JSON.parse(
			await readFile(join(store.metadataDir, 'iterations', '001.json'), 'utf8')
		) as {
			exitCode: number;
			outcome: { status: string };
			triumvirate: { stageFailure: string };
		};
		expect(firstIteration.exitCode).toBe(orchestratorExitCodes.providerError);
		expect(firstIteration.outcome.status).toBe('provider_error');
		expect(firstIteration.triumvirate.stageFailure).toBe(
			'triumvirate primary stage failed with exit code 72'
		);
		const runs = (await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8')).trim();
		expect(runs).toContain('"stopReason":"completed"');
		expect(runs).toContain('"iterations":2');
		// The failed primary stage edited a file before the provider error; its path must reach the
		// ledger's filesEdited list so counts and paths stay in sync for stage-failure iterations.
		const ledgerEntry = JSON.parse(runs.split('\n').at(-1) ?? '{}') as {
			filesEdited: string[];
		};
		expect(ledgerEntry.filesEdited).toContain('src/partial.ts');
	});

	test('triumvirate continues after primary idle timeout when max iterations is one', async () => {
		const store = await makeStore('triumvirate-primary-idle-timeout-max-one');
		const backend = new SequencedBackend(
			[
				[{ type: 'error', reason: 'idle' }],
				[
					{ type: 'assistant_text', chunk: 'AIDD_RESULT: {"planMarkdown":"Primary"}\n' },
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"planMarkdown":"Secondary"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"decision":"execute","finalActions":"Implement"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
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
				if (callIndex === 4) await completeFeature(store, 'feature-core');
			}
		);
		const runtimePlan = resolveRunPlan(
			parseArgs([
				'--project-dir',
				store.projectDir,
				'--cli',
				'native',
				'--triumvirate',
				'--secondary-cli',
				'native',
				'--overseer-cli',
				'native',
				'--exec-cli',
				'native',
			]),
			{ ...config, maxIterations: 1 }
		);

		const exitCode = await runOrchestrator(runtimePlan, {
			backend,
			backendFactory: () => backend,
			rootDir,
			store,
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(backend.calls).toBe(5);
		await expect(store.readFeature('feature-core')).resolves.toMatchObject({ passes: true });
		const firstIteration = JSON.parse(
			await readFile(join(store.metadataDir, 'iterations', '001.json'), 'utf8')
		) as {
			exitCode: number;
			outcome: { status: string };
			triumvirate: { stageFailure: string };
		};
		expect(firstIteration.exitCode).toBe(orchestratorExitCodes.idleTimeout);
		expect(firstIteration.outcome.status).toBe('idle_timeout');
		expect(firstIteration.triumvirate.stageFailure).toBe(
			'triumvirate primary stage failed with exit code 71'
		);
		const runs = (await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8')).trim();
		expect(runs).toContain('"stopReason":"completed"');
		expect(runs).toContain('"iterations":2');
		expect(runs).not.toContain('"stopReason":"max_iterations"');
	});

	test('triumvirate retries after primary rate limit like single-agent mode', async () => {
		const store = await makeStore('triumvirate-primary-rate-limit');
		const backend = new SequencedBackend(
			[
				[{ type: 'error', reason: 'rate_limit', meta: 'rate limit' }],
				[
					{ type: 'assistant_text', chunk: 'AIDD_RESULT: {"planMarkdown":"Primary"}\n' },
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"planMarkdown":"Secondary"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"decision":"execute","finalActions":"Implement"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
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
				if (callIndex === 4) await completeFeature(store, 'feature-core');
			}
		);
		const runtimePlan = resolveRunPlan(
			parseArgs([
				'--project-dir',
				store.projectDir,
				'--cli',
				'native',
				'--triumvirate',
				'--secondary-cli',
				'native',
				'--overseer-cli',
				'native',
				'--exec-cli',
				'native',
			]),
			{ ...config, maxIterations: 1, rateLimitBackoffSeconds: 0, rateLimitBufferSeconds: 0 }
		);

		const exitCode = await runOrchestrator(runtimePlan, {
			backend,
			backendFactory: () => backend,
			rootDir,
			store,
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(backend.calls).toBe(5);
		await expect(store.readFeature('feature-core')).resolves.toMatchObject({ passes: true });
		const firstIteration = JSON.parse(
			await readFile(join(store.metadataDir, 'iterations', '001.json'), 'utf8')
		) as { exitCode: number };
		expect(firstIteration.exitCode).toBe(orchestratorExitCodes.rateLimited);
		const runs = (await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8')).trim();
		expect(runs).toContain('"stopReason":"completed"');
		expect(runs).toContain('"iterations":2');
		expect(runs).not.toContain('"stopReason":"max_iterations"');
	});

	test('triumvirate preserves rate-limit classification when backoff exceeds budget', async () => {
		const store = await makeStore('triumvirate-rate-limit-beyond-budget');
		const backend = new FakeBackend([
			{ type: 'error', reason: 'rate_limit', meta: 'rate limit' },
		]);
		const runtimePlan = resolveRunPlan(
			parseArgs([
				'--project-dir',
				store.projectDir,
				'--cli',
				'native',
				'--triumvirate',
				'--secondary-cli',
				'native',
				'--overseer-cli',
				'native',
				'--exec-cli',
				'native',
			]),
			{
				...config,
				maxIterations: 1,
				rateLimitBackoffSeconds: 300,
				rateLimitBufferSeconds: 0,
				timeoutSeconds: 1,
			}
		);

		const exitCode = await runOrchestrator(runtimePlan, {
			backend,
			backendFactory: () => backend,
			rootDir,
			store,
		});

		expect(exitCode).toBe(orchestratorExitCodes.rateLimited);
		expect(backend.calls).toBe(1);
		const runs = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
		const entry = JSON.parse(runs.trim()) as { exitCode: number; summary: string };
		expect(entry.exitCode).toBe(orchestratorExitCodes.rateLimited);
		expect(entry.summary).toContain('rate_limit_wait_exceeds_budget');
		expect(entry.summary).not.toContain('wall_clock_timeout');
	});

	test('triumvirate honors stop requests after planning-stage backend failures', async () => {
		const store = await makeStore('triumvirate-stop-after-planning-failure');
		const runtimePlan = plan(store.projectDir, [
			'--triumvirate',
			'--secondary-cli',
			'native',
			'--overseer-cli',
			'native',
			'--exec-cli',
			'native',
		]);
		const backend = new SequencedBackend(
			[[{ type: 'error', reason: 'idle' }]],
			async (callIndex) => {
				if (callIndex === 0) await writeFile(runtimePlan.stopPolicy.stopFile, 'stop\n');
			}
		);

		const exitCode = await runOrchestrator(runtimePlan, {
			backend,
			backendFactory: () => backend,
			rootDir,
			store,
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(backend.calls).toBe(1);
		const iteration = JSON.parse(
			await readFile(join(store.metadataDir, 'iterations', '001.json'), 'utf8')
		) as { stopRequested: boolean };
		expect(iteration.stopRequested).toBe(true);
		const runs = (await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8')).trim();
		expect(runs).toContain('"stopReason":"stop_requested"');
		expect(runs).toContain('"exitCode":0');
		expect(runs).not.toContain('"stopReason":"completed"');
	});

	test('triumvirate continues after execution idle timeout when max iterations is one', async () => {
		const store = await makeStore('triumvirate-execution-idle-timeout-max-one');
		const backend = new SequencedBackend(
			[
				[
					{ type: 'assistant_text', chunk: 'AIDD_RESULT: {"planMarkdown":"Primary"}\n' },
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"planMarkdown":"Secondary"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"decision":"execute","finalActions":"Implement"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[{ type: 'error', reason: 'idle' }],
				[
					{ type: 'assistant_text', chunk: 'AIDD_RESULT: {"planMarkdown":"Primary"}\n' },
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"planMarkdown":"Secondary"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"decision":"execute","finalActions":"Implement"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
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
				if (callIndex === 7) await completeFeature(store, 'feature-core');
			}
		);
		const runtimePlan = resolveRunPlan(
			parseArgs([
				'--project-dir',
				store.projectDir,
				'--cli',
				'native',
				'--triumvirate',
				'--secondary-cli',
				'native',
				'--overseer-cli',
				'native',
				'--exec-cli',
				'native',
			]),
			{ ...config, maxIterations: 1 }
		);

		const exitCode = await runOrchestrator(runtimePlan, {
			backend,
			backendFactory: () => backend,
			rootDir,
			store,
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(backend.calls).toBe(8);
		await expect(store.readFeature('feature-core')).resolves.toMatchObject({ passes: true });
		const firstIteration = JSON.parse(
			await readFile(join(store.metadataDir, 'iterations', '001.json'), 'utf8')
		) as {
			exitCode: number;
			outcome: { status: string };
		};
		expect(firstIteration.exitCode).toBe(orchestratorExitCodes.idleTimeout);
		expect(firstIteration.outcome.status).toBe('idle_timeout');
		const runs = (await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8')).trim();
		expect(runs).toContain('"stopReason":"completed"');
		expect(runs).toContain('"iterations":2');
		expect(runs).not.toContain('"stopReason":"max_iterations"');
	});

	test('triumvirate invalid stage failures write the run ledger before exiting', async () => {
		const store = await makeStore('triumvirate-invalid-stage-run-ledger');
		const backend = new SequencedBackend([
			[{ type: 'error', reason: 'provider', meta: 'HTTP 401 invalid API key.' }],
		]);
		const runtimePlan = plan(store.projectDir, [
			'--triumvirate',
			'--secondary-cli',
			'native',
			'--overseer-cli',
			'native',
			'--exec-cli',
			'native',
		]);

		const exitCode = await runOrchestrator(runtimePlan, {
			backend,
			backendFactory: () => backend,
			rootDir,
			store,
		});

		expect(exitCode).toBe(orchestratorExitCodes.validationError);
		expect(backend.calls).toBe(1);
		const iteration = JSON.parse(
			await readFile(join(store.metadataDir, 'iterations', '001.json'), 'utf8')
		) as { exitCode: number; outcome: { status: string }; runId: string };
		expect(iteration.exitCode).toBe(orchestratorExitCodes.providerError);
		expect(iteration.outcome.status).toBe('provider_error');
		const [runSummary] = (await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8'))
			.trim()
			.split(/\r?\n/)
			.map(
				(line) =>
					JSON.parse(line) as { exitCode: number; runId: string; stopReason: string }
			);
		expect(runSummary).toMatchObject({
			exitCode: orchestratorExitCodes.validationError,
			runId: iteration.runId,
			stopReason: 'exit_error',
		});
	});

	test('triumvirate aborts when a planning stage repeatedly mutates its mirror', async () => {
		const store = await makeStore('triumvirate-repeated-planning-mutation');
		const backend = new SequencedBackend(
			[
				[
					{ type: 'assistant_text', chunk: 'AIDD_RESULT: {"planMarkdown":"Primary"}\n' },
					{ type: 'done', exitCode: 0, filesModified: ['primary-only.txt'] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"planMarkdown":"Primary retry"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: ['primary-retry.txt'] },
				],
			],
			async (callIndex, input) => {
				if (callIndex === 0) {
					await writeFile(join(input.cwd, 'primary-only.txt'), 'primary mutation\n');
					return;
				}
				if (callIndex === 1) {
					await writeFile(join(input.cwd, 'primary-retry.txt'), 'retry mutation\n');
				}
			}
		);
		const runtimePlan = plan(store.projectDir, [
			'--triumvirate',
			'--secondary-cli',
			'native',
			'--overseer-cli',
			'native',
			'--exec-cli',
			'native',
		]);

		const exitCode = await runOrchestrator(runtimePlan, {
			backend,
			backendFactory: () => backend,
			rootDir,
			store,
		});

		expect(exitCode).toBe(orchestratorExitCodes.validationError);
		expect(backend.calls).toBe(2);
		const iterationJson = await readFile(
			join(store.metadataDir, 'iterations', '001.json'),
			'utf8'
		);
		expect(iterationJson).toContain(
			'triumvirate primary planning stage modified its planning mirror after retry'
		);
		const structured = JSON.parse(iterationJson) as {
			triumvirate: {
				execution?: unknown;
				planningMirrorViolation: {
					changedPaths: string[];
					filesModifiedCount: number;
					role: string;
					stage: string;
					structuredResultEmitted: boolean;
				};
				primaryPlan: {
					planningMirrorMutation: {
						changedPaths: string[];
					};
				};
				stageFailure: string;
			};
		};
		expect(structured.triumvirate.stageFailure).toBe(
			'triumvirate primary planning stage modified its planning mirror after retry'
		);
		expect(structured.triumvirate.planningMirrorViolation).toEqual({
			changedPaths: ['primary-retry.txt'],
			filesModifiedCount: 1,
			role: 'primary',
			stage: 'primary',
			structuredResultEmitted: true,
		});
		expect(structured.triumvirate.primaryPlan.planningMirrorMutation.changedPaths).toEqual([
			'primary-retry.txt',
		]);
		expect(structured.triumvirate.execution).toBeUndefined();
	});

	test('triumvirate aborts when a planning stage mutates the original worktree', async () => {
		const store = await makeStore('triumvirate-guard');
		await initializeGitProject(store.projectDir);
		const backend = new SequencedBackend(
			[
				[
					{ type: 'assistant_text', chunk: 'AIDD_RESULT: {"planMarkdown":"Primary"}\n' },
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
			],
			() => writeFile(join(store.projectDir, 'unexpected.txt'), 'changed\n')
		);
		const runtimePlan = plan(store.projectDir, [
			'--triumvirate',
			'--secondary-cli',
			'native',
			'--overseer-cli',
			'native',
			'--exec-cli',
			'native',
		]);

		const exitCode = await runOrchestrator(runtimePlan, {
			backend,
			backendFactory: () => backend,
			rootDir,
			store,
		});

		expect(exitCode).toBe(orchestratorExitCodes.validationError);
		expect(backend.calls).toBe(1);
		const iterationJson = await readFile(
			join(store.metadataDir, 'iterations', '001.json'),
			'utf8'
		);
		expect(iterationJson).toContain('original worktree changed during primary planning stage');
		const structured = JSON.parse(iterationJson) as {
			triumvirate: {
				guardFailure: string;
				metadata: { guard: { target: string } };
				primaryPlan: { cwdKind: string; role: string };
			};
		};
		expect(structured.triumvirate.guardFailure).toBe(
			'original worktree changed during primary planning stage'
		);
		expect(structured.triumvirate.metadata.guard.target).toBe('original_project_worktree');
		expect(structured.triumvirate.primaryPlan).toMatchObject({
			cwdKind: 'planning_mirror',
			role: 'primary',
		});
	});

	test('triumvirate original worktree guard ignores run ledger updates', async () => {
		const store = await makeStore('triumvirate-guard-run-ledger');
		await initializeGitProject(store.projectDir);
		const backend = new SequencedBackend(
			[
				[
					{ type: 'assistant_text', chunk: 'AIDD_RESULT: {"planMarkdown":"Primary"}\n' },
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"planMarkdown":"Secondary"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
				],
				[
					{
						type: 'assistant_text',
						chunk: 'AIDD_RESULT: {"decision":"execute","finalActions":"Implement"}\n',
					},
					{ type: 'done', exitCode: 0, filesModified: [] },
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
				if (callIndex === 0) {
					await writeFile(
						join(store.metadataDir, 'runs.jsonl'),
						'{"summary":"external run ledger update"}\n'
					);
				}
				if (callIndex === 3) {
					await completeFeature(store, 'feature-core');
				}
			}
		);
		const runtimePlan = plan(store.projectDir, [
			'--triumvirate',
			'--secondary-cli',
			'native',
			'--overseer-cli',
			'native',
			'--exec-cli',
			'native',
		]);

		const exitCode = await runOrchestrator(runtimePlan, {
			backend,
			backendFactory: () => backend,
			rootDir,
			store,
		});

		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(backend.calls).toBe(4);
		const iterationJson = await readFile(
			join(store.metadataDir, 'iterations', '001.json'),
			'utf8'
		);
		expect(iterationJson).not.toContain('original worktree changed');
		const status = await gitText(store.projectDir, [
			'status',
			'--porcelain=v1',
			'--untracked-files=all',
		]);
		expect(status).toContain('.aidd/runs.jsonl');
	});

	test(
		'never commits the run ledger, and reports runLedgerDirty when real dirt is present',
		async () => {
			const store = await makeStore('ineligible-commit');
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
						// Introduce an additional dirty change that is NOT the run ledger.
						await writeFile(join(store.projectDir, 'extra-dirty.txt'), 'dirty\n');
					}
				),
			});

			expect(exitCode).toBe(orchestratorExitCodes.success);
			// .aidd/runs.jsonl must exist.
			const runsContent = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
			expect(runsContent.length).toBeGreaterThan(0);
			// runLedgerDirty must be true because the worktree carried real (non-harness) dirt.
			const runSummary = JSON.parse(runsContent.trim()) as { runLedgerDirty: boolean };
			expect(runSummary.runLedgerDirty).toBe(true);
			// The ledger is never committed — not "not committed because the worktree was dirty".
			// aidd makes no commits of its own, so worktree state cannot make it commit the ledger.
			const status = await gitText(store.projectDir, [
				'status',
				'--porcelain=v1',
				'--untracked-files=all',
			]);
			expect(status).toContain('extra-dirty.txt');
			expect(status).toContain('.aidd/runs.jsonl');
		},
		slowOrchestratorTestTimeoutMs
	);
});
