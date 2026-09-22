import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type {
	PipelineSessionReport,
	PipelineStepResultRecord,
	RecipeStepDefinition,
} from '../../frontend/src/api/types.ts';

const FRONTEND_SRC = join(import.meta.dir, '..', '..', 'frontend', 'src');

function recipeStep(sequenceNumber: number): RecipeStepDefinition {
	return {
		configJson: {},
		id: `recipe-step-${sequenceNumber}`,
		name: `Outer step ${sequenceNumber}`,
		stepType: sequenceNumber === 2 ? 'recipe-ref' : 'skill',
	};
}

function executedStep(
	id: string,
	displayOrder: number,
	sequenceNumber: number,
	options: {
		depth?: number;
		parentStepResultId?: string;
		phase?: PipelineStepResultRecord['phase'];
		status?: PipelineStepResultRecord['status'];
		stepType?: PipelineStepResultRecord['stepType'];
	} = {},
): PipelineStepResultRecord {
	return {
		attemptKind: null,
		attemptNumber: null,
		completedAt: options.status === 'running' ? null : 2_000,
		depth: options.depth ?? 0,
		displayOrder,
		durationMs: options.status === 'running' ? null : 1_000,
		errorMessage: null,
		executionIdentity: null,
		exitCode: options.status === 'running' ? null : 0,
		id,
		outputSummary: null,
		parentStepResultId: options.parentStepResultId ?? null,
		phase: options.phase ?? 'step',
		runId: null,
		sequenceNumber,
		sessionId: 'pipeline-session',
		startedAt: 1_000,
		status: options.status ?? 'completed',
		stepDefinitionId: null,
		stepName: id,
		stepType: options.stepType ?? 'skill',
	};
}

function report(
	recipeSteps: RecipeStepDefinition[],
	stepResults: PipelineStepResultRecord[],
): PipelineSessionReport {
	return {
		recipeSteps,
		session: {
			activeTopLevelStep: null,
			completedAt: null,
			completedTopLevelSteps: 1,
			durationMs: null,
			errorMessage: null,
			executionIdentities: [],
			id: 'pipeline-session',
			parametersJson: '{}',
			parkedWorkRuns: 0,
			projectName: 'aidd',
			projectPath: 'D:/applications/aidd',
			recipeId: 'outer-recipe',
			recipeName: 'Outer recipe',
			recipeSha256: null,
			skippedTopLevelSteps: 0,
			startedAt: 1_000,
			status: 'running',
			totalSteps: recipeSteps.length,
		},
		stepResults,
	};
}

function rowKeys(input: PipelineSessionReport): string[] {
	const script = [
		"import { buildStepRows } from './src/pages/pipelineSessions/stepRowModel.ts';",
		`const report = ${JSON.stringify(input)};`,
		"console.log(JSON.stringify(buildStepRows(report).map((row) => row.kind === 'executed' ? row.result.id : `pending-${row.sequenceNumber}`)));",
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) {
		throw new Error(new TextDecoder().decode(result.stderr));
	}
	return JSON.parse(new TextDecoder().decode(result.stdout)) as string[];
}

describe('pipeline step tree order', () => {
	test('keeps active nested children before the remaining steps in a partial recipe', () => {
		const recipeSteps = Array.from({ length: 9 }, (_, index) => recipeStep(index + 1));
		const rows = rowKeys(
			report(recipeSteps, [
				executedStep('outer-1', 1, 1),
				executedStep('outer-2', 2, 2, { status: 'running', stepType: 'recipe-ref' }),
				executedStep('child-1', 3, 1, {
					depth: 1,
					parentStepResultId: 'outer-2',
				}),
				executedStep('child-1-post-hook', 4, 1, {
					depth: 1,
					parentStepResultId: 'child-1',
					phase: 'post-hook',
					stepType: 'hook',
				}),
				executedStep('child-2', 5, 2, {
					depth: 1,
					parentStepResultId: 'outer-2',
					status: 'running',
				}),
			]),
		);

		expect(rows).toEqual([
			'outer-1',
			'outer-2',
			'child-1',
			'child-1-post-hook',
			'child-2',
			...Array.from({ length: 7 }, (_, index) => `pending-${index + 3}`),
		]);
		expect(rows.indexOf('child-2')).toBeLessThan(rows.indexOf('pending-3'));
	});

	test('sorts executed rows by persisted display order when the recipe is unavailable', () => {
		const rows = rowKeys(
			report(
				[],
				[
					executedStep('child-2', 3, 2, { depth: 1, parentStepResultId: 'outer-1' }),
					executedStep('outer-1', 1, 1, { stepType: 'recipe-ref' }),
					executedStep('child-1', 2, 1, { depth: 1, parentStepResultId: 'outer-1' }),
				],
			),
		);

		expect(rows).toEqual(['outer-1', 'child-1', 'child-2']);
	});

	test('inserts a missing outer step between persisted parent trees', () => {
		const recipeSteps = Array.from({ length: 3 }, (_, index) => recipeStep(index + 1));
		const rows = rowKeys(
			report(recipeSteps, [
				executedStep('outer-1', 1, 1, { stepType: 'recipe-ref' }),
				executedStep('nested-1', 2, 1, {
					depth: 1,
					parentStepResultId: 'outer-1',
				}),
				executedStep('outer-3', 3, 3),
			]),
		);

		expect(rows).toEqual(['outer-1', 'nested-1', 'pending-2', 'outer-3']);
	});

	test('renders the complete recipe as pending before any result is persisted', () => {
		const recipeSteps = Array.from({ length: 3 }, (_, index) => recipeStep(index + 1));

		expect(rowKeys(report(recipeSteps, []))).toEqual(['pending-1', 'pending-2', 'pending-3']);
	});

	test('preserves every persisted row exactly once in a completed nested recipe', () => {
		const recipeSteps = Array.from({ length: 3 }, (_, index) => recipeStep(index + 1));
		const persisted = [
			executedStep('outer-3', 7, 3),
			executedStep('nested-retry', 5, 2, {
				depth: 1,
				parentStepResultId: 'nested-2',
			}),
			executedStep('outer-1', 1, 1),
			executedStep('outer-2', 2, 2, { stepType: 'recipe-ref' }),
			executedStep('nested-1', 3, 1, { depth: 1, parentStepResultId: 'outer-2' }),
			executedStep('nested-2', 4, 2, { depth: 1, parentStepResultId: 'outer-2' }),
			executedStep('outer-2-post-hook', 6, 2, {
				parentStepResultId: 'outer-2',
				phase: 'post-hook',
				stepType: 'hook',
			}),
		];
		const keys = rowKeys(report(recipeSteps, persisted));

		expect(keys).toEqual([
			'outer-1',
			'outer-2',
			'nested-1',
			'nested-2',
			'nested-retry',
			'outer-2-post-hook',
			'outer-3',
		]);
		expect(new Set(keys).size).toBe(persisted.length);
	});

	test('all three UI surfaces consume the shared corrected row model', async () => {
		const [desktopRows, mobileRows, reportPage, rowModel] = await Promise.all([
			readFile(join(FRONTEND_SRC, 'pages', 'runs', 'PipelineStepTableRows.tsx'), 'utf8'),
			readFile(join(FRONTEND_SRC, 'pages', 'runs', 'PipelineStepSubRows.tsx'), 'utf8'),
			readFile(
				join(FRONTEND_SRC, 'pages', 'pipelineSessions', 'PipelineSessionReportPage.tsx'),
				'utf8',
			),
			readFile(join(FRONTEND_SRC, 'pages', 'runs', 'pipelineStepSubRowModel.ts'), 'utf8'),
		]);

		expect(rowModel).toContain('const rows = buildStepRows(report.data)');
		expect(desktopRows).toContain('usePipelineStepSubRows(sessionId)');
		expect(mobileRows).toContain('usePipelineStepSubRows(sessionId)');
		expect(reportPage).toContain('const rows = buildStepRows(report);');
		expect(reportPage).toContain('{rows.map((row) =>');
	});
});
