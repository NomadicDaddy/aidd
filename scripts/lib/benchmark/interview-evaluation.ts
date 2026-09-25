import path from 'node:path';

import type { EvaluationResult } from './types.ts';

import { hasExpectedQuestions, scoreExpectedCoverage } from './expected-tokens.ts';
import { readTextIfExists } from './shared.ts';
import { isRecord, stringArray, stringValue } from './validation.ts';

function hasNonEmptyFile(workspaceDir: string, relativePath: string): boolean {
	return readTextIfExists(path.join(workspaceDir, relativePath)).trim().length > 0;
}

/**
 * Share of a response body that is the agent's own protocol stream rather than prose.
 *
 * When a run is cut short the harness writes the raw JSONL transcript into the response file,
 * which left a well-formed markdown scaffold wrapped around envelopes like
 * `{"type":"item.completed","item":{"type":"error",…}}`. The file is non-empty, so a
 * presence-only check scored it a correct answer.
 *
 * Measured over the 44 interview artifacts on disk the separation is total: 11 files are 100%
 * envelope lines (every one exactly 1056 bytes, all of them cut-short codex low runs) and the
 * other 33 are 0%. A majority threshold is therefore far from either population, and it stays
 * correct for a real answer that quotes a JSONL line or two while explaining one.
 */
function protocolEnvelopeShare(body: string): number {
	const lines = body.split('\n');
	let total = 0;
	let envelopes = 0;
	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (line.length === 0) continue;
		total += 1;
		if (!line.startsWith('{')) continue;
		try {
			const parsed: unknown = JSON.parse(line);
			if (isRecord(parsed) && stringValue(parsed.type) !== undefined) envelopes += 1;
		} catch {
			// A brace-led line that is not one complete JSON object is ordinary prose or code.
		}
	}
	return total > 0 ? envelopes / total : 0;
}

/** The answer itself, without the question scaffold the harness writes above it. */
function responseBody(text: string): string {
	const marker = text.indexOf('## Response');
	return marker === -1 ? text : text.slice(marker + '## Response'.length);
}

export function evaluateInterview(
	workspaceDir: string,
	expectation: Record<string, unknown>,
): EvaluationResult {
	const responseFiles = stringArray(expectation.responseFiles);
	const present = responseFiles.filter((filePath) => hasNonEmptyFile(workspaceDir, filePath));
	if (present.length === 0) {
		return { notes: ['expected interview response file was not written'], score: 0 };
	}
	const dumped = present.filter((filePath) => {
		const body = responseBody(readTextIfExists(path.join(workspaceDir, filePath)));
		return protocolEnvelopeShare(body) >= 0.5;
	});
	// ANY dumped file fails the task, not only an all-dumped set. The interview expectation lists
	// both the per-question answer and `.aidd/responses.md`, a generated index of links that the
	// harness writes whether or not the model answered — so it is never a dump and, under an
	// all-must-be-dumped rule, silently rescued every contaminated run. A transcript written into
	// a response file means this run did not produce a clean answer set; a generated index cannot
	// make it one.
	if (dumped.length > 0) {
		return {
			notes: [`response is the agent protocol stream, not an answer: ${dumped.join(', ')}`],
			score: 0,
		};
	}
	// With an answer key, graded on the facts a correct answer must name, as quiz is. Without one
	// it stays pass-on-presence, so a fixture that never had a key is not failed against questions
	// nobody wrote.
	if (hasExpectedQuestions(expectation)) {
		const graded = scoreExpectedCoverage(answerText(workspaceDir, present), expectation);
		return {
			notes: [`response files: ${present.join(', ')}`, ...graded.notes],
			score: graded.score,
		};
	}
	return { notes: [`response files: ${present.join(', ')}`], score: 1 };
}

/**
 * The answer alone: text after `## Response` in files that carry it. The question scaffold above
 * the marker and the generated index (which has none) both echo the question, so grading them
 * credits any key token the question itself mentions — an EMPTY answer scored 0.067 that way when
 * the key was validated. The CLI writes the marker itself, so every real response carries it.
 */
function answerText(workspaceDir: string, files: string[]): string {
	let text = '';
	for (const filePath of files) {
		const content = readTextIfExists(path.join(workspaceDir, filePath));
		const marker = content.indexOf('## Response');
		if (marker !== -1) text += `${content.slice(marker + '## Response'.length)}\n`;
	}
	return text;
}
