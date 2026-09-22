import { describe, expect, test } from 'bun:test';

import type { PipelineSessionRecord } from '../../frontend/src/api/types.ts';

import { pipelineSessionStepSummary } from '../../frontend/src/pages/pipelineSessions/pipelineSessionSummary.ts';
import { pipelineStepDuration } from '../../frontend/src/pages/pipelineSessions/pipelineStepDuration.ts';

const runs = async (file: string): Promise<string> =>
	await Bun.file(`${import.meta.dir}/../../frontend/src/pages/runs/${file}`).text();
const pipeline = async (file: string): Promise<string> =>
	await Bun.file(`${import.meta.dir}/../../frontend/src/pages/pipelineSessions/${file}`).text();

function session(overrides: Partial<PipelineSessionRecord> = {}): PipelineSessionRecord {
	return {
		activeTopLevelStep: null,
		completedAt: 2_000,
		completedTopLevelSteps: 4,
		durationMs: 1_000,
		errorMessage: null,
		executionIdentities: [],
		id: 'pipeline-session',
		parametersJson: '{}',
		parkedWorkRuns: 0,
		projectName: 'aidd',
		projectPath: 'D:/applications/aidd',
		recipeId: 'coding',
		recipeName: 'Coding',
		recipeSha256: null,
		skippedTopLevelSteps: 0,
		startedAt: 1_000,
		status: 'completed',
		totalSteps: 4,
		...overrides,
	};
}

describe('Runs and pipeline local remediation', () => {
	test('keeps Runs filters readable and stacked History in page flow', async () => {
		const filters = await runs('RunFilters.tsx');
		const table = await runs('UnifiedExecutionTable.tsx');

		expect(filters).toContain('repeat(4,minmax(7.5rem,1fr))');
		// History is in page flow at every width now, not only when stacked: the table imposes no
		// height budget of its own at any breakpoint.
		expect(table).not.toContain('var(--fill-height)');
		expect(table).not.toContain('min-h-[20rem]');
	});

	test('makes truncated summaries keyboard-readable and compact reasoning explicit', async () => {
		const row = await runs('ActiveRunRow.tsx');
		const pipelineRow = await runs('PipelineSessionRow.tsx');
		const stepRows = await runs('PipelineStepTableRows.tsx');

		expect(row).toContain('<Tooltip content={run.aiSummary}>');
		expect(row).toContain('focus-visible:ring-2');
		expect(row).not.toContain('title={run.aiSummary ?? undefined}');
		for (const source of [row, pipelineRow, stepRows]) {
			expect(source).toContain('compactReasoningLabel');
		}
	});

	test('uses one caption scale and a line-aligned stop-detail clamp', async () => {
		const panel = await runs('RunDetailPanel.tsx');

		expect(panel).toContain('microLabelClass');
		expect(panel).not.toContain('fieldLabelClass');
		expect(panel).toContain('max-h-[calc(12lh+1rem+2px)]');
		expect(panel).not.toContain('max-h-48');
	});

	test('formats live and terminal step durations truthfully', () => {
		const startedAt = 1_700_000_000_000;
		expect(
			pipelineStepDuration(
				{ durationMs: null, startedAt, status: 'running' },
				startedAt + 95_000,
			),
		).toBe('1m 35s');
		expect(
			pipelineStepDuration({ durationMs: null, startedAt, status: 'stopped' }, startedAt),
		).toBe('—');
		expect(
			pipelineStepDuration({ durationMs: 42_000, startedAt, status: 'failed' }, startedAt),
		).toBe('42s');
	});

	test('describes completed, parked, failed, stopped, queued, and running sessions', () => {
		expect(pipelineSessionStepSummary(session())).toBe('All 4 steps completed');
		expect(pipelineSessionStepSummary(session({ parkedWorkRuns: 1 }))).toBe(
			'All 4 steps completed · 1 parked',
		);
		expect(
			pipelineSessionStepSummary(
				session({ completedTopLevelSteps: 0, status: 'failed', totalSteps: 1 }),
			),
		).toBe('Failed: 0 of 1 step completed');
		expect(
			pipelineSessionStepSummary(
				session({ completedTopLevelSteps: 3, status: 'stopped', totalSteps: 9 }),
			),
		).toBe('Stopped: 3 of 9 steps completed');
		expect(
			pipelineSessionStepSummary(
				session({ completedAt: null, completedTopLevelSteps: 0, status: 'queued' }),
			),
		).toBe('0 of 4 steps completed · waiting to start');
		expect(
			pipelineSessionStepSummary(
				session({
					activeTopLevelStep: { sequenceNumber: 2, stepName: 'Apply' },
					completedAt: null,
					completedTopLevelSteps: 1,
					status: 'running',
				}),
			),
		).toBe('1 completed · step 2 active — Apply · 2 remaining');
	});

	// A coding step that found no work ends its recipe and skips the rest. Read against completed
	// steps alone, that green session said "1 of 4 steps completed", as though it had stalled.
	test('names the steps a session skipped instead of leaving them unaccounted for', () => {
		expect(
			pipelineSessionStepSummary(
				session({
					completedTopLevelSteps: 1,
					skippedTopLevelSteps: 3,
					status: 'completed',
				}),
			),
		).toBe('Completed: 1 of 4 steps completed · 3 skipped');
		expect(
			pipelineSessionStepSummary(
				session({
					activeTopLevelStep: { sequenceNumber: 3, stepName: 'Apply' },
					completedAt: null,
					completedTopLevelSteps: 1,
					skippedTopLevelSteps: 1,
					status: 'running',
				}),
			),
		).toBe('1 completed · 1 skipped · step 3 active — Apply · 1 remaining');
	});

	test('makes nested step hierarchy and run qualifications explicit', async () => {
		const rows = await pipeline('StepRows.tsx');

		expect(rows).toContain('border-l-2 border-control-border pt-2 pl-2 sm:pt-3 sm:pl-4');
		expect(rows).toContain(
			"variant={step.depth === 0 ? 'panel' : step.depth === 1 ? 'default' : 'sunken'}",
		);
		expect(rows).toContain("if (depth >= 2) return 'sm:mx-12'");
		expect(rows).toContain("Child of {parentStepName ?? 'parent step'}");
		expect(rows).toContain('Nested under same-name parent');
		expect(rows).toContain('Step {step.sequenceNumber} of {totalSteps}');
		expect(rows).toContain('headingLevel={stepHeadingLevel(step.depth)}');
		// The depth ladder remains semantic while the step title keeps the readable 16px card rank.
		expect(rows).toContain('level="section"');
		expect(rows).toContain('Work parked');
		expect(rows).toContain('Process lost');
	});

	test('keeps pipeline prose and compact metrics with their content', async () => {
		const detail = await pipeline('StepRunDetail.tsx');
		const summary = await pipeline('SessionSummaryCard.tsx');

		// The cap is gone rather than kept: the page declares the reading content type, the rail is
		// that width, and a descendant restating it only added a third right edge to a card that
		// wanted one. The grid still ends where the card does.
		expect(detail).not.toContain('grid max-w-[61rem]');
		expect(detail).toContain('grid-cols-[minmax(0,max-content)_minmax(0,max-content)]');
		expect(detail).toContain('grid max-w-full');
		expect(detail).toContain('valueClassName={proseMeasureClass}');
		expect(summary).toContain('<Tooltip');
		expect(summary).not.toContain('detail="Skill steps are directive runs');
	});
});
