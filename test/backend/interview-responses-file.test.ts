import { describe, expect, test } from 'bun:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseResponses } from '../../backend/src/services/interview/responsesFile.ts';
import {
	getProjectInterviewDetail,
	submitProjectInterviewAnswer,
} from '../../backend/src/services/interviewService.ts';
import {
	readInterviewQuestions,
	writeInterviewIndex,
} from '../../cli/src/modes/interview-questions.ts';

import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

const QUESTIONS_CONTENT = `- **[HIGH]** What is the primary goal of this project?
- **[MED]** What is the target audience?
- **[LOW]** What color scheme do you prefer?
`;

// Every hostile shape in one answer: an interior blank line, a continuation line with leading
// whitespace, a line that reads as a new question bullet, markdown headings (one of them the
// section heading the answer file itself uses), a tilde-only line, and a line that reads as an
// inline Response.
const HOSTILE_ANSWER = [
	'First line of the answer.',
	'',
	'  indented continuation',
	'- **[HIGH]** a line that looks like a new question bullet',
	'## a markdown heading',
	'## Response',
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

async function answersById(dir: string): Promise<Map<string, string>> {
	const detail = await getProjectInterviewDetail(dir);
	return new Map(detail.answeredQuestions.map((q) => [q.id, q.response]));
}

describe('legacy inline responses.md', () => {
	test('parses a single-line file exactly as before', () => {
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

	test('reads a fenced multi-line answer byte for byte', () => {
		const file = [
			'- **[HIGH]** Prompt?',
			'  Response:',
			'  ~~~~',
			'  real answer',
			'',
			'    deep indent',
			'  ~~~',
			'  ~~~~',
			'',
		].join('\n');
		expect(parseResponses(file)[0]?.response).toBe('real answer\n\n  deep indent\n~~~');
	});

	test('treats a bare Response line with no block as an empty answer', () => {
		const file = ['- **[HIGH]** Prompt?', '  Response:', ''].join('\n');
		expect(parseResponses(file)[0]?.response).toBe('');
	});

	test('takes the rest of the file when a fence is never closed', () => {
		const file = ['- **[HIGH]** Prompt?', '  Response:', '  ~~~', '  one', '  two'].join('\n');
		expect(parseResponses(file)[0]?.response).toBe('one\ntwo');
	});
});

describe('submitProjectInterviewAnswer', () => {
	test('writes the answer to its responseN.md and the index the CLI writes', async () => {
		const dir = await setupTempProject();
		try {
			await submitProjectInterviewAnswer(dir, { answer: 'Developers.', questionId: 'q-2' });
			const response2 = await readFile(
				join(dir, '.aidd', 'responses', 'response2.md'),
				'utf8',
			);
			expect(response2).toContain('## Question\n\nWhat is the target audience?\n');
			expect(response2).toContain('## Response\n\nDevelopers.\n');

			// A CLI interview run rewrites the index from the files. It must write the same
			// index and keep the panel's answer, which it once erased.
			const indexPath = join(dir, '.aidd', 'responses.md');
			const panelIndex = await readFile(indexPath, 'utf8');
			const questions = await readInterviewQuestions(join(dir, '.aidd', 'questions.md'));
			await writeInterviewIndex(dir, questions);
			expect(await readFile(indexPath, 'utf8')).toBe(panelIndex);
			expect(await answersById(dir)).toEqual(new Map([['q-2', 'Developers.']]));
		} finally {
			await removeTempTree(dir);
		}
	});

	test('persists every line of a hostile multi-line answer across a reread', async () => {
		const dir = await setupTempProject();
		try {
			const detail = await submitProjectInterviewAnswer(dir, {
				answer: HOSTILE_ANSWER,
				questionId: 'q-1',
			});
			expect(detail.answeredQuestions[0]?.response).toBe(HOSTILE_ANSWER);
			expect((await answersById(dir)).get('q-1')).toBe(HOSTILE_ANSWER);
		} finally {
			await removeTempTree(dir);
		}
	});

	test('leaves the file of an answer it did not touch byte for byte', async () => {
		const dir = await setupTempProject();
		try {
			await submitProjectInterviewAnswer(dir, { answer: HOSTILE_ANSWER, questionId: 'q-1' });
			const response1 = join(dir, '.aidd', 'responses', 'response1.md');
			const before = await readFile(response1, 'utf8');

			await submitProjectInterviewAnswer(dir, { answer: 'Developers.', questionId: 'q-2' });

			expect(await readFile(response1, 'utf8')).toBe(before);
			const byId = await answersById(dir);
			expect(byId.get('q-1')).toBe(HOSTILE_ANSWER);
			expect(byId.get('q-2')).toBe('Developers.');
		} finally {
			await removeTempTree(dir);
		}
	});

	test('moves an answer the panel once kept inline into its file', async () => {
		const dir = await setupTempProject();
		try {
			const inline = [
				'- **[LOW]** What color scheme do you prefer?',
				'  Response:',
				'  ~~~',
				'  slate',
				'',
				'    and blue',
				'  ~~~',
				'',
			].join('\n');
			await writeFile(join(dir, '.aidd', 'responses.md'), inline, 'utf8');

			await submitProjectInterviewAnswer(dir, { answer: 'Ship it.', questionId: 'q-1' });

			const response3 = await readFile(
				join(dir, '.aidd', 'responses', 'response3.md'),
				'utf8',
			);
			expect(response3).toContain('## Response\n\nslate\n\n  and blue\n');
			const byId = await answersById(dir);
			expect(byId.get('q-3')).toBe('slate\n\n  and blue');
			expect(byId.get('q-1')).toBe('Ship it.');
		} finally {
			await removeTempTree(dir);
		}
	});

	test('an edit to a CLI-answered question replaces its file', async () => {
		const dir = await setupTempProject();
		try {
			const questions = await readInterviewQuestions(join(dir, '.aidd', 'questions.md'));
			await mkdir(join(dir, '.aidd', 'responses'), { recursive: true });
			await writeFile(
				join(dir, '.aidd', 'responses', 'response1.md'),
				'# Question 1: Goal\n\n## Question\n\nThe goal?\n\n## Response\n\nFrom the code.\n',
				'utf8',
			);
			await writeInterviewIndex(dir, questions);

			await submitProjectInterviewAnswer(dir, { answer: 'From Phillip.', questionId: 'q-1' });

			expect(await answersById(dir)).toEqual(new Map([['q-1', 'From Phillip.']]));
		} finally {
			await removeTempTree(dir);
		}
	});
});
