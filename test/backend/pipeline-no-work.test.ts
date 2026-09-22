import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { WebDatabase } from '../../backend/src/db/client.ts';
import type { RecipeService } from '../../backend/src/services/recipeService.ts';
import type { RunService } from '../../backend/src/services/runService.ts';
import type { SkillService } from '../../backend/src/services/skillService.ts';
import type { TelemetryService } from '../../backend/src/services/telemetryService.ts';
import type { SessionLifecycle } from '../../backend/src/services/pipeline/sessionLifecycle.ts';
import type { ExecutionContext } from '../../backend/src/services/pipeline/types.ts';
import type { RecipeConfigValue, RecipeDefinition } from '../../backend/src/types.ts';

import { endsRecipeOnNoWork, noWorkSummary } from '../../backend/src/services/pipeline/noWork.ts';
import { StepExecutor } from '../../backend/src/services/pipeline/stepExecutor.ts';

const NO_WORK_SUMMARY =
	'No eligible incomplete coding features are available; 2 feature(s) are dependency-blocked; 1 feature(s) are pending approval';

interface StepRow {
	id: string;
	outputSummary?: string | undefined;
	status?: string;
	stepName: string;
}

// Drives the real step loop over a recipe whose first run finds no work, recording every step row
// and every run the loop launches.
async function runRecipe(firstStepConfig: Record<string, RecipeConfigValue>) {
	const rows: StepRow[] = [];
	const launched: string[] = [];
	const lifecycle = {
		completeStep: async (input: {
			outputSummary?: string;
			resultId: string;
			status: string;
		}) => {
			const row = rows.find((candidate) => candidate.id === input.resultId);
			if (!row) throw new Error(`no row ${input.resultId}`);
			row.outputSummary = input.outputSummary;
			row.status = input.status;
		},
		createStepResult: async (input: { skippedSummary?: string; stepName: string }) => {
			const row: StepRow = {
				id: `row_${rows.length + 1}`,
				stepName: input.stepName,
				...(input.skippedSummary === undefined
					? {}
					: { outputSummary: input.skippedSummary, status: 'skipped' }),
			};
			rows.push(row);
			return row;
		},
		markStepRunning: async () => {},
		progress: { publishActive: async () => {}, refreshCompleted: async () => {} },
		setStepRunId: async () => {},
	} as unknown as SessionLifecycle;
	const runService = {
		getRun: async (id: string) => ({
			aiSummary: null,
			errorMessage: null,
			exitCode: 0,
			id,
			status: 'completed',
			// Only the first run finds nothing; any later one did real work.
			stopReason: id === 'run_1' ? 'no_work' : 'completed',
			summary: id === 'run_1' ? NO_WORK_SUMMARY : 'Did the work.',
		}),
		launchRun: async (request: { mode?: string }) => {
			launched.push(request.mode ?? 'coding');
			return {
				backend: 'claude-code',
				id: `run_${launched.length}`,
				model: 'claude-opus-5',
				projectName: 'example',
				projectPath: '/tmp/example',
				startedAt: Date.now(),
			};
		},
		// A no-work run's transcript is only the launch banner.
		readOutput: async () => ({ output: '[aidd] claude-code run started' }),
	} as unknown as RunService;
	const executor = new StepExecutor({
		activeShellProcesses: new Map(),
		db: {} as WebDatabase,
		getAllowedRoots: () => [],
		lifecycle,
		recipeService: {} as RecipeService,
		runService,
		skillService: {} as SkillService,
		stopFlags: new Set(),
		telemetryService: {} as TelemetryService,
	});
	const recipe = {
		steps: [
			{ configJson: firstStepConfig, id: 's1', name: 'Run coding', stepType: 'aidd-cli' },
			{
				configJson: { prompt: 'Review it.' },
				id: 's2',
				name: 'Review',
				stepType: 'aidd-cli',
			},
			{
				configJson: { prompt: 'Fix it.' },
				id: 's3',
				name: 'Remediate',
				stepType: 'aidd-cli',
			},
		],
	} as unknown as RecipeDefinition;
	const context: ExecutionContext = {
		depth: 0,
		displayOrder: 0,
		initiator: 'operator',
		lineage: [],
		parameters: {},
		projectDir: '/tmp/example',
		sessionId: 'pipe_no_work',
	};
	const result = await executor.executeRecipeSteps(recipe, context);
	return { launched, result, rows };
}

describe('a coding step that finds no work', () => {
	test('ends a recipe that opts in, recording the rest as skipped', async () => {
		const { launched, result, rows } = await runRecipe({ skipRemainingOnNoWork: true });

		expect(result).toEqual({ ok: true, stopped: false });
		// Only the coding run launched; the review and remediation had nothing new to look at.
		expect(launched).toEqual(['coding']);
		expect(rows.map((row) => [row.stepName, row.status])).toEqual([
			['Run coding', 'completed'],
			['Review', 'skipped'],
			['Remediate', 'skipped'],
		]);
		expect(rows[1]?.outputSummary).toBe('Skipped: Run coding found no eligible work');
	});

	test('runs every later step when the recipe does not opt in', async () => {
		const { launched, rows } = await runRecipe({});

		expect(launched).toEqual(['coding', 'directive', 'directive']);
		expect(rows.every((row) => row.status === 'completed')).toBe(true);
	});

	// The step console showed the launch banner and nothing else, which read as a hung run.
	test('shows why nothing was selected, not the empty transcript', async () => {
		for (const config of [{ skipRemainingOnNoWork: true }, {}]) {
			const { rows } = await runRecipe(config);
			expect(rows[0]?.outputSummary).toBe(NO_WORK_SUMMARY);
		}
	});
});

describe('no-work detection', () => {
	test('reads only a completed no_work run as finding nothing', () => {
		const run = {
			status: 'completed',
			stopReason: 'no_work',
			summary: `  ${NO_WORK_SUMMARY} `,
		};

		expect(noWorkSummary(run)).toBe(NO_WORK_SUMMARY);
		expect(noWorkSummary({ ...run, summary: null })).toBe('No eligible work was selected.');
		expect(noWorkSummary({ ...run, stopReason: 'completed' })).toBeUndefined();
		// A roadmap-gate refusal stops as 'blocked', which the operator must see, not skip past.
		expect(noWorkSummary({ ...run, stopReason: 'blocked' })).toBeUndefined();
		expect(noWorkSummary({ ...run, status: 'failed' })).toBeUndefined();
	});

	test('needs the opt-in, a no-work result, and a step that did not fail', () => {
		const step = {
			configJson: { skipRemainingOnNoWork: true },
			id: 's1',
			name: 'Run coding',
			stepType: 'aidd-cli',
		} as RecipeDefinition['steps'][number];
		const noWork = { noWork: true, ok: true, stopped: false };

		expect(endsRecipeOnNoWork(step, noWork)).toBe(true);
		expect(endsRecipeOnNoWork({ ...step, configJson: {} }, noWork)).toBe(false);
		expect(endsRecipeOnNoWork(step, { ...noWork, noWork: false })).toBe(false);
		expect(endsRecipeOnNoWork(step, { ...noWork, ok: false })).toBe(false);
	});
});

describe('recipe opt-in', () => {
	const recipesDir = join(import.meta.dir, '..', '..', 'recipes');
	async function firstStepConfig(name: string): Promise<Record<string, RecipeConfigValue>> {
		const recipe = JSON.parse(await readFile(join(recipesDir, `${name}.json`), 'utf8')) as {
			steps: { configJson: Record<string, RecipeConfigValue> }[];
		};
		return recipe.steps[0]?.configJson ?? {};
	}

	test('the coding-first recipes end on no work', async () => {
		for (const name of [
			'coding',
			'coding-review-remediate-document-changes',
			'coding-spirit-coderabbit-document-changes',
			'triumvirate-coding-document-changes',
		]) {
			expect(await firstStepConfig(name)).toHaveProperty('skipRemainingOnNoWork', true);
		}
	});

	// Their validate pass checks completed features whether or not this coding pass did anything.
	test('recipes that validate after coding keep going', async () => {
		for (const name of ['remediate-audit-findings', 'remediate-bugs']) {
			expect(await firstStepConfig(name)).not.toHaveProperty('skipRemainingOnNoWork');
		}
	});
});
