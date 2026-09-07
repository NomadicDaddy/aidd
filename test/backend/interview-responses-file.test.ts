import { describe, expect, test } from 'bun:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	parseResponses,
	serializeResponses,
} from '../../backend/src/services/interview/responsesFile.ts';
import {
	getProjectInterviewDetail,
	submitProjectInterviewAnswer,
} from '../../backend/src/services/interviewService.ts';

import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

const QUESTIONS_CONTENT = `- **[HIGH]** What is the primary goal of this project?
- **[MED]** What is the target audience?
- **[LOW]** What color scheme do you prefer?
`;

// Every hostile shape in one answer: an interior blank line, a continuation line with leading
// whitespace, a line that reads as a new question bullet, a markdown heading, a tilde-only line
// that must push the fence one tilde longer, and a line that reads as another Response.
const HOSTILE_ANSWER = [
	'First line of the answer.',
	'',
	'  indented continuation',
	'- **[HIGH]** a line that looks like a new question bullet',
	'## a markdown heading',
	'~~~',
	'  Response: not really a response',
	'still the same answer',
].join('\n');

async function setupTempProject(): Promise<string> {
	const dir = await testTempDir('interview-responses-');
	await mkdir(join(dir, '.aidd'), { recursive: true });
	await writeFile(join(dir, '.aidd', 'questions.md'), QUESTIONS_CONTENT, 'utf8');
	return dir;
}

function roundTrip(response: string): string {
	const file = serializeResponses([{ priority: 'HIGH', prompt: 'Prompt?', response }]);
	return parseResponses(file)[0]?.response ?? '<no entry parsed>';
}

describe('responses.md encoding', () => {
	test('round-trips a hostile multi-line answer byte for byte', () => {
		expect(roundTrip(HOSTILE_ANSWER)).toBe(HOSTILE_ANSWER);
	});

	test('escalates the fence past a tilde-only line in the body', () => {
		const file = serializeResponses([
			{ priority: 'HIGH', prompt: 'Prompt?', response: '~~~\n~~~~\nend' },
		]);
		expect(file).toContain('  ~~~~~\n');
		expect(roundTrip('~~~\n~~~~\nend')).toBe('~~~\n~~~~\nend');
	});

	test('round-trips an answer that ends in a blank line', () => {
		expect(roundTrip('a line\n\n')).toBe('a line\n\n');
	});

	test('round-trips an answer whose second line opens a new question bullet', () => {
		const answer = 'real answer\n- **[LOW]** not a question';
		expect(roundTrip(answer)).toBe(answer);
		expect(
			parseResponses(
				serializeResponses([{ priority: 'HIGH', prompt: 'P?', response: answer }]),
			),
		).toHaveLength(1);
	});

	test('round-trips an answer that is only whitespace-bearing continuation lines', () => {
		expect(roundTrip('start\n    deep indent\n\tliteral tab')).toBe(
			'start\n    deep indent\n\tliteral tab',
		);
	});

	test('keeps single-line answers in the pre-existing single-line form', () => {
		const file = serializeResponses([
			{ priority: 'HIGH', prompt: 'Prompt?', response: 'A short answer.' },
		]);
		expect(file).toBe('- **[HIGH]** Prompt?\n  Response: A short answer.\n');
	});

	test('parses a legacy single-line file exactly as before', () => {
		const legacy = [
			'- **[HIGH]** What is the primary goal of this project?',
			'  Response: To build a great product.  ',
			'',
			'- **[MED]** What is the target audience?',
			'  Response: Developers.',
			'',
		].join('\n');
		expect(parseResponses(legacy)).toEqual([
			{
				priority: 'HIGH',
				prompt: 'What is the primary goal of this project?',
				response: 'To build a great product.',
			},
			{ priority: 'MED', prompt: 'What is the target audience?', response: 'Developers.' },
		]);
	});

	test('treats a bare Response line with no block as an empty answer', () => {
		const file = ['- **[HIGH]** Prompt?', '  Response:', ''].join('\n');
		expect(parseResponses(file)[0]?.response).toBe('');
		expect(roundTrip('')).toBe('');
	});

	test('takes the rest of the file when a fence is never closed', () => {
		const file = ['- **[HIGH]** Prompt?', '  Response:', '  ~~~', '  one', '  two'].join('\n');
		expect(parseResponses(file)[0]?.response).toBe('one\ntwo');
	});
});

describe('submitProjectInterviewAnswer with multi-line answers', () => {
	test('persists every line of a multi-line answer across a reread', async () => {
		const dir = await setupTempProject();
		try {
			const detail = await submitProjectInterviewAnswer(dir, {
				answer: HOSTILE_ANSWER,
				questionId: 'q-1',
			});
			expect(detail.answeredQuestions[0]?.response).toBe(HOSTILE_ANSWER);

			const reread = await getProjectInterviewDetail(dir);
			expect(reread.answeredQuestions[0]?.response).toBe(HOSTILE_ANSWER);
		} finally {
			await removeTempTree(dir);
		}
	});

	test('never shortens an answer the save did not touch', async () => {
		const dir = await setupTempProject();
		try {
			await submitProjectInterviewAnswer(dir, { answer: HOSTILE_ANSWER, questionId: 'q-1' });
			const responsesPath = join(dir, '.aidd', 'responses.md');
			const before = await readFile(responsesPath, 'utf8');

			await submitProjectInterviewAnswer(dir, { answer: 'Developers.', questionId: 'q-2' });

			const detail = await getProjectInterviewDetail(dir);
			const byId = new Map(detail.answeredQuestions.map((q) => [q.id, q.response]));
			expect(byId.get('q-1')).toBe(HOSTILE_ANSWER);
			expect(byId.get('q-2')).toBe('Developers.');

			// The untouched entry's bytes are the same bytes, not merely an equal-looking answer.
			const after = await readFile(responsesPath, 'utf8');
			expect(after.startsWith(before.trimEnd())).toBe(true);
		} finally {
			await removeTempTree(dir);
		}
	});

	test('leaves a hand-seeded multi-line answer intact when another answer is saved', async () => {
		const dir = await setupTempProject();
		try {
			const seeded = serializeResponses([
				{
					priority: 'LOW',
					prompt: 'What color scheme do you prefer?',
					response: 'slate\n\n  and blue\n',
				},
			]);
			await writeFile(join(dir, '.aidd', 'responses.md'), seeded, 'utf8');

			await submitProjectInterviewAnswer(dir, { answer: 'Ship it.', questionId: 'q-1' });

			const detail = await getProjectInterviewDetail(dir);
			const byId = new Map(detail.answeredQuestions.map((q) => [q.id, q.response]));
			expect(byId.get('q-3')).toBe('slate\n\n  and blue\n');
		} finally {
			await removeTempTree(dir);
		}
	});
});
