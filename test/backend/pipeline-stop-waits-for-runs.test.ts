import { describe, expect, test } from 'bun:test';

import type { RecipeDefinition } from '../../backend/src/types.ts';

import { pipelineSessions, pipelineStepResults } from '../../backend/src/db/schema.ts';
import { ProjectBusyError } from '../../backend/src/services/errors.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { makeStopHarness, waitFor } from './_helpers/pipeline-stop-harness.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

// Session Stop on pipe_1792021713018_b4e72e97 marked the session and its step stopped at once,
// while run_1792021713214_70b584f0 worked on for five more minutes and then completed: the step
// lost its real outcome and the session gave up its place while its run still worked.

const twoRunSteps: Omit<RecipeDefinition, 'parameters'> = {
	id: 'two_runs',
	name: 'Two runs',
	steps: [
		{ configJson: { prompt: 'First.' }, id: 'first', name: 'First', stepType: 'aidd-cli' },
		{ configJson: { prompt: 'Second.' }, id: 'second', name: 'Second', stepType: 'aidd-cli' },
	],
};

async function withHarness(
	body: (harness: Awaited<ReturnType<typeof makeStopHarness>>) => Promise<void>,
) {
	const workspace = await testTempDir('aidd-pipeline-stop-');
	const harness = await makeStopHarness(workspace);
	try {
		await body(harness);
	} finally {
		harness.dispose();
		await removeTempTree(workspace);
	}
}

describe('Session Stop waits for its runs', () => {
	test('a running run step: stopping until the run ends, then its real outcome', async () => {
		await withHarness(async ({ launch, pipelineService, runs, session, steps }) => {
			const launched = await launch(twoRunSteps);
			await waitFor(async () => (await steps(launched.id))[0]?.runId === 'run_1', 'run 1');

			expect(await pipelineService.stopSession(launched.id)).toBe('stopping');
			const stopping = await session(launched.id);
			expect(stopping?.status).toBe('stopping');
			expect(stopping?.stopRequestedAt).toBeNumber();
			expect((await steps(launched.id))[0]?.status).toBe('running');
			expect(runs.calls).toEqual(['stop:run_1']);
			// A second plain Stop changes nothing; ending the run early is the explicit force.
			expect(await pipelineService.stopSession(launched.id)).toBe('stopping');
			expect(runs.calls.some((call) => call.startsWith('kill:'))).toBe(false);

			// The run reaches its iteration boundary having finished its work.
			runs.finish('run_1', {
				exitCode: 0,
				status: 'completed',
				stopReason: 'stop_requested',
			});
			await waitFor(async () => (await session(launched.id))?.status === 'stopped', 'stop');

			const [step, ...rest] = await steps(launched.id);
			expect(step?.status).toBe('completed');
			expect(step?.exitCode).toBe(0);
			expect(rest).toEqual([]);
			expect(runs.runs.size).toBe(1);
		});
	});

	test('a run that ends stopped records stopped with its exit code', async () => {
		await withHarness(async ({ launch, pipelineService, runs, session, steps }) => {
			const launched = await launch(twoRunSteps);
			await waitFor(async () => (await steps(launched.id))[0]?.runId === 'run_1', 'run 1');
			await pipelineService.stopSession(launched.id);
			runs.finish('run_1', { exitCode: 3, status: 'stopped', stopReason: 'stop_requested' });
			await waitFor(async () => (await session(launched.id))?.status === 'stopped', 'stop');
			const [step] = await steps(launched.id);
			expect(step?.status).toBe('stopped');
			expect(step?.exitCode).toBe(3);
		});
	});

	test('a shell step is killed at once and the session stops', async () => {
		await withHarness(async ({ launch, pipelineService, session, steps }) => {
			const launched = await launch({
				id: 'long_shell_stop',
				name: 'Long shell',
				steps: [
					{
						configJson: { command: 'sleep 30' },
						id: 'sh',
						name: 'Sleep',
						stepType: 'shell',
					},
				],
			});
			await waitFor(async () => (await steps(launched.id))[0]?.status === 'running', 'shell');
			await Bun.sleep(200);

			const startedStop = Date.now();
			expect(await pipelineService.stopSession(launched.id)).toBe('stopped');
			expect(Date.now() - startedStop).toBeLessThan(10_000);
			expect((await session(launched.id))?.status).toBe('stopped');
			expect((await steps(launched.id))[0]?.status).toBe('stopped');
		});
	});

	test('a step whose run already exited finishes immediately', async () => {
		await withHarness(async ({ launch, pipelineService, runs, session, steps }) => {
			const launched = await launch(twoRunSteps);
			await waitFor(async () => (await steps(launched.id))[0]?.runId === 'run_1', 'run 1');
			const run = runs.runs.get('run_1');
			if (!run) throw new Error('run_1 was not launched');
			run.exited = true;

			expect(await pipelineService.stopSession(launched.id)).toBe('stopped');
			expect((await session(launched.id))?.status).toBe('stopped');
			const [step] = await steps(launched.id);
			expect(step?.status).toBe('stopped');
			expect(step?.exitCode).toBe(0);
		});
	});

	test('a stopping session keeps its place, and a force stop kills the run tree', async () => {
		await withHarness(async (harness) => {
			const { launch, pipelineService, runs, session, steps } = harness;
			const launched = await launch(twoRunSteps);
			await waitFor(async () => (await steps(launched.id))[0]?.runId === 'run_1', 'run 1');
			expect(await pipelineService.stopSession(launched.id)).toBe('stopping');

			// The project claim and the active count still see the session while its run works.
			expect(await pipelineService.countActiveSessions()).toBe(1);
			await expect(
				launch({ ...twoRunSteps, id: 'second_session', name: 'Second session' }),
			).rejects.toBeInstanceOf(ProjectBusyError);
			expect(runs.runs.size).toBe(1);

			expect(await pipelineService.stopSession(launched.id, { force: true })).toBe('stopped');
			expect(runs.calls).toContain('kill:run_1');
			const [step] = await steps(launched.id);
			expect(step?.status).toBe('failed');
			expect(step?.exitCode).toBe(-1);
			expect((await session(launched.id))?.status).toBe('stopped');
			expect(await pipelineService.countActiveSessions()).toBe(0);
		});
	});
});

describe('a stopping session across a restart', () => {
	// The web process went down mid-stop. Resume must carry the stop on, not write the session back
	// to running and start its next step.
	test('resumes still stopping, waits for the run, and ends stopped', async () => {
		await withHarness(async (harness) => {
			const { db, pipelineService, projectDir, recipeService, runs, session, steps } =
				harness;
			await recipeService.writeRecipe({ ...twoRunSteps, parameters: [] });
			await runs.service.launchRun(
				{ mode: 'directive', projectDir },
				{ initiator: 'operator' },
			);
			const now = Date.now();
			await db.insert(pipelineSessions).values({
				currentStepIndex: 0,
				id: 'pipe_restart',
				parametersJson: '{}',
				projectName: 'project',
				projectPath: projectDir,
				recipeId: 'two_runs',
				recipeName: 'Two runs',
				startedAt: now,
				status: 'stopping',
				stopRequestedAt: now,
				totalSteps: 2,
			});
			await db.insert(pipelineStepResults).values({
				attemptKind: 'ordinary',
				attemptNumber: 1,
				displayOrder: 1,
				id: 'step_restart',
				runId: 'run_1',
				sequenceNumber: 1,
				sessionId: 'pipe_restart',
				startedAt: now,
				status: 'running',
				stepDefinitionId: 'first',
				stepName: 'First',
				stepType: 'aidd-cli',
			});

			await pipelineService.resumeStaleSessions();
			await waitFor(() => runs.calls.includes('stop:run_1'), 'the resumed stop request');
			expect((await session('pipe_restart'))?.status).toBe('stopping');

			runs.finish('run_1', {
				exitCode: 0,
				status: 'completed',
				stopReason: 'stop_requested',
			});
			await waitFor(
				async () => (await session('pipe_restart'))?.status === 'stopped',
				'stop',
			);
			const rows = await steps('pipe_restart');
			expect(rows.map((row) => [row.stepName, row.status])).toEqual([['First', 'completed']]);
			expect(runs.runs.size).toBe(1);
		});
	});
});
