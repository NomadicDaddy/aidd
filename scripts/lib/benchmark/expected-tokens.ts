/**
 * Weighted expected-token coverage: the harness's one way of asking whether an answer contains
 * the facts a correct answer must contain.
 *
 * Extracted from the quiz evaluator so the interview task can be graded the same way. Before this,
 * interview asked only whether a response file existed and was not a transcript dump, which scored
 * 1.000 on 66 of 66 runs across every stack — a task with no discriminating power contributes a
 * constant to the composite and hides the differences the benchmark exists to measure. quiz, using
 * this same logic, spread from 0.031 to 1.000 over the same population.
 *
 * Token containment is a crude proxy for correctness and it is deliberately the crude one already
 * in use: a shared definition that both tasks agree on is worth more here than two clever ones that
 * drift. It rewards naming the right files and symbols, which is what these questions ask for.
 */
import type { EvaluationResult } from './types.ts';

import { clampScore } from './shared.ts';
import { isRecord, numberValue, stringArray, stringValue } from './validation.ts';

/** Whether an expectation carries an answer key. Absent means the caller keeps its ungraded
 * behaviour rather than scoring zero against questions nobody wrote. */
export function hasExpectedQuestions(expectation: Record<string, unknown>): boolean {
	return Array.isArray(expectation.questions) && expectation.questions.length > 0;
}

/**
 * Score `corpus` against the expectation's weighted questions.
 *
 * Per question the score is the fraction of its expected tokens present, weighted, then normalized
 * by the total weight — so a partial answer earns partial credit and weights need not sum to 1.
 * Matching is case-insensitive containment, which is why answer keys should list distinctive
 * identifiers (file and symbol names) rather than ordinary prose words that any answer would
 * contain by accident.
 */
export function scoreExpectedCoverage(
	corpus: string,
	expectation: Record<string, unknown>,
): EvaluationResult {
	const questionsRaw = Array.isArray(expectation.questions) ? expectation.questions : [];
	const lowerCorpus = corpus.toLowerCase();
	const notes: string[] = [];
	let earned = 0;
	let total = 0;
	for (const questionRaw of questionsRaw) {
		if (!isRecord(questionRaw)) continue;
		const weight = numberValue(questionRaw.weight) ?? 0;
		const expected = stringArray(questionRaw.expected);
		const id = stringValue(questionRaw.id) ?? 'unknown';
		total += weight;
		const matches = expected.filter((token) => lowerCorpus.includes(token.toLowerCase()));
		const ratio = expected.length > 0 ? matches.length / expected.length : 0;
		earned += weight * ratio;
		notes.push(`${id}: ${matches.length}/${expected.length} expected tokens`);
	}
	return { notes, score: total > 0 ? clampScore(earned / total) : 0 };
}
