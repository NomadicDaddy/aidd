import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import type { PipelineStepResultRecord } from '../../frontend/src/api/types.ts';

import { buildAttemptLabels } from '../../frontend/src/pages/pipelineSessions/stepAttempts.ts';

const frontendRoot = resolve(import.meta.dir, '../../frontend/src');

function source(relativePath: string): Promise<string> {
	return Bun.file(resolve(frontendRoot, relativePath)).text();
}

function stepRow(
	id: string,
	displayOrder: number,
	options: Partial<PipelineStepResultRecord> = {},
): PipelineStepResultRecord {
	return {
		attemptKind: null,
		attemptNumber: null,
		completedAt: 2_000,
		depth: 0,
		displayOrder,
		durationMs: 1_000,
		errorMessage: null,
		executionIdentity: null,
		exitCode: 0,
		id,
		outputSummary: null,
		parentStepResultId: null,
		phase: 'step',
		runId: null,
		sequenceNumber: 1,
		sessionId: 'pipe_labels',
		startedAt: 1_000,
		status: 'completed',
		stepDefinitionId: 'recipe-step-1',
		stepName: 'Build',
		stepType: 'shell',
		...options,
	};
}

describe('pipeline step attempt labels', () => {
	test('leaves the only recorded attempt of a step unbadged', () => {
		const labels = buildAttemptLabels([
			stepRow('only', 1, { attemptKind: 'ordinary', attemptNumber: 1 }),
		]);

		expect(labels.size).toBe(0);
	});

	test('numbers an ordinary retry that failed and then completed', () => {
		const labels = buildAttemptLabels([
			stepRow('first', 1, {
				attemptKind: 'ordinary',
				attemptNumber: 1,
				errorMessage: 'exit 1',
				exitCode: 1,
				status: 'failed',
			}),
			stepRow('second', 2, { attemptKind: 'ordinary', attemptNumber: 2 }),
		]);

		expect(labels.get('first')).toBe('Attempt 1');
		expect(labels.get('second')).toBe('Attempt 2');
	});

	test('seats an auto-fix row against the attempt it followed', () => {
		// The remediation is persisted as a child of the failed attempt under its own name, so it
		// never shares a group with the ordinary attempts and has to identify itself.
		const labels = buildAttemptLabels([
			stepRow('first', 1, {
				attemptKind: 'ordinary',
				attemptNumber: 1,
				status: 'failed',
			}),
			stepRow('fix', 2, {
				attemptKind: 'auto-fix',
				attemptNumber: 1,
				parentStepResultId: 'first',
				stepName: 'Build auto-fix',
				stepType: 'aidd-cli',
			}),
			stepRow('second', 3, { attemptKind: 'ordinary', attemptNumber: 2 }),
		]);

		expect(labels.get('fix')).toBe('Auto-fix after attempt 1');
		expect(labels.get('first')).toBe('Attempt 1');
		expect(labels.get('second')).toBe('Attempt 2');
	});

	test('numbers legacy duplicate rows by display order when a step definition anchors them', () => {
		const labels = buildAttemptLabels([
			stepRow('legacy-b', 5, { status: 'completed' }),
			stepRow('legacy-a', 4, { status: 'failed' }),
		]);

		expect(labels.get('legacy-a')).toBe('Attempt 1');
		expect(labels.get('legacy-b')).toBe('Attempt 2');
	});

	test('refuses to number legacy duplicates that only agree on a step name', () => {
		const labels = buildAttemptLabels([
			stepRow('loose-a', 1, { stepDefinitionId: null, status: 'failed' }),
			stepRow('loose-b', 2, { stepDefinitionId: null }),
		]);

		expect(labels.get('loose-a')).toBe('Retry (legacy)');
		expect(labels.get('loose-b')).toBe('Retry (legacy)');
	});

	test('keeps persisted ordinals and marks unlabelled siblings across the migration boundary', () => {
		const labels = buildAttemptLabels([
			stepRow('pre-migration', 1, { status: 'failed' }),
			stepRow('post-migration', 2, { attemptKind: 'ordinary', attemptNumber: 2 }),
		]);

		expect(labels.get('pre-migration')).toBe('Retry (legacy)');
		expect(labels.get('post-migration')).toBe('Attempt 2');
	});

	test('does not group rows that belong to different logical steps', () => {
		const labels = buildAttemptLabels([
			stepRow('step-1', 1),
			stepRow('step-2', 2, { sequenceNumber: 2, stepDefinitionId: 'recipe-step-2' }),
		]);

		expect(labels.size).toBe(0);
	});

	test('renders the label on every surface that lists step rows', async () => {
		// Three surfaces show the same steps in three boxes. A badge missing from one of them is
		// exactly the case this feature exists to prevent: two rows with the same name and
		// different outcomes, and nothing on screen saying they are attempts at one step.
		const [reportRow, runsTableRow, runsCardRow] = await Promise.all([
			source('pages/pipelineSessions/StepRows.tsx'),
			source('pages/runs/PipelineStepTableRows.tsx'),
			source('pages/runs/PipelineStepSubRows.tsx'),
		]);

		expect(reportRow).toContain(
			'{attemptLabel ? <Badge tone="amber">{attemptLabel}</Badge> : null}',
		);
		expect(runsTableRow).toContain('row.attemptLabel ?');
		expect(runsCardRow).toContain('row.attemptLabel ?');
	});
});
