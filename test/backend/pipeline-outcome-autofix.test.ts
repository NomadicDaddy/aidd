import { describe, expect, test } from 'bun:test';

import type { PipelineStepResultRecord } from '../../backend/src/types.ts';

import { summarizeSessionOutcome } from '../../backend/src/services/pipeline/outcomeSummary.ts';

// An auto-fix run is a remediation attempt inside one recipe step, not a step of the recipe. It
// used to count as a top-level step of its own, so a step that failed even after its auto-fix
// completed read as a partial success: the remediation stood in for a step the recipe never won.

let order = 0;

function row(
	stepName: string,
	attemptNumber: number,
	attemptKind: 'auto-fix' | 'ordinary',
	status: 'completed' | 'failed',
): PipelineStepResultRecord {
	order += 1;
	return {
		attemptKind,
		attemptNumber,
		depth: 0,
		displayOrder: order,
		parentStepResultId: null,
		phase: 'step',
		runId: attemptKind === 'auto-fix' ? `run_fix_${order}` : null,
		sequenceNumber: 1,
		status,
		stepDefinitionId: 'step_1',
		stepName,
		stepType: attemptKind === 'auto-fix' ? 'aidd-cli' : 'shell',
	} as PipelineStepResultRecord;
}

describe('summarizeSessionOutcome with auto-fix attempts', () => {
	test('a step that still fails after a completed auto-fix fails the session', () => {
		const outcome = summarizeSessionOutcome(false, [
			row('Needs fix', 1, 'ordinary', 'failed'),
			row('Needs fix auto-fix', 1, 'auto-fix', 'completed'),
			row('Needs fix', 2, 'ordinary', 'failed'),
		]);
		expect(outcome).toEqual({
			failedStepNames: ['Needs fix'],
			producedArtifacts: [],
			status: 'failed',
		});
	});

	test('a step recovered by its retry is completed whatever its auto-fix did', () => {
		const outcome = summarizeSessionOutcome(true, [
			row('Needs fix', 1, 'ordinary', 'failed'),
			row('Needs fix auto-fix', 1, 'auto-fix', 'failed'),
			row('Needs fix', 2, 'ordinary', 'completed'),
		]);
		expect(outcome.status).toBe('completed');
		expect(outcome.failedStepNames).toEqual([]);
		expect(outcome.producedArtifacts.map((artifact) => artifact.stepName)).toEqual([
			'Needs fix',
		]);
	});
});
