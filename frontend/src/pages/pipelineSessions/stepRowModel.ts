import type {
	PipelineSessionReport,
	PipelineStepResultRecord,
	RecipeStepDefinition,
} from '../../api/types.ts';

import { buildAttemptLabels } from './stepAttempts.ts';

/**
 * Build a unified ordered list of every step in the session — both executed
 * (persisted as PipelineStepResultRecord) and pending (only known from the
 * recipe definition). Top-level recipe steps (depth 0, phase 'step') are the
 * anchors: each one is shown with its sequence number. Non-anchor rows
 * (hooks, nested recipe-ref children, auto-fix retries) render inline beneath
 * their parent anchor so the vertical list reads as the full plan.
 *
 * If the recipe definition is unavailable (e.g. deleted), the list falls back
 * to showing only the executed rows, preserving the original behavior.
 */
export type StepRow =
	| {
			/** Label for this row among the other attempts at the same step; null when it is the only one. */
			attemptLabel: null | string;
			kind: 'executed';
			parentStepName: null | string;
			result: PipelineStepResultRecord;
	  }
	| { kind: 'pending'; sequenceNumber: number; step: RecipeStepDefinition };

export function buildStepRows(report: PipelineSessionReport): StepRow[] {
	const recipeStepCount = report.recipeSteps.length;
	const executed = [...report.stepResults].sort((left, right) => {
		return left.displayOrder - right.displayOrder;
	});
	const stepNameById = new Map(executed.map((result) => [result.id, result.stepName]));
	const attemptLabels = buildAttemptLabels(executed);
	const executedRow = (result: PipelineStepResultRecord): StepRow => ({
		attemptLabel: attemptLabels.get(result.id) ?? null,
		kind: 'executed',
		parentStepName:
			result.parentStepResultId === null
				? null
				: (stepNameById.get(result.parentStepResultId) ?? null),
		result,
	});
	// When the recipe plan is unavailable, fall back to the original executed-only view.
	if (recipeStepCount === 0) {
		return executed.map(executedRow);
	}

	const rows: StepRow[] = [];
	let nextRecipeSequence = 1;
	for (const result of executed) {
		const isTopLevelStep = result.depth === 0 && result.phase === 'step';
		if (isTopLevelStep) {
			while (
				nextRecipeSequence < result.sequenceNumber &&
				nextRecipeSequence <= recipeStepCount
			) {
				rows.push({
					kind: 'pending',
					sequenceNumber: nextRecipeSequence,
					step: report.recipeSteps[nextRecipeSequence - 1]!,
				});
				nextRecipeSequence += 1;
			}
			if (result.sequenceNumber === nextRecipeSequence) nextRecipeSequence += 1;
		}
		rows.push(executedRow(result));
	}
	while (nextRecipeSequence <= recipeStepCount) {
		rows.push({
			kind: 'pending',
			sequenceNumber: nextRecipeSequence,
			step: report.recipeSteps[nextRecipeSequence - 1]!,
		});
		nextRecipeSequence += 1;
	}
	return rows;
}
