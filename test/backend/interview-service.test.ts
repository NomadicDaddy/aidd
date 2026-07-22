import { describe, expect, test } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	getProjectInterviewDetail,
	submitProjectInterviewAnswer,
} from '../../backend/src/services/interviewService.ts';

const TEMP_DIR = join(import.meta.dir, '__interview_test_temp__');
const QUESTIONS_CONTENT = `- **[HIGH]** What is the primary goal of this project?
- **[MED]** What is the target audience?
- **[LOW]** What color scheme do you prefer?
`;

async function setupTempProject(): Promise<string> {
	await mkdir(join(TEMP_DIR, '.aidd'), { recursive: true });
	await writeFile(join(TEMP_DIR, '.aidd', 'questions.md'), QUESTIONS_CONTENT, 'utf8');
	return TEMP_DIR;
}

async function cleanupTempProject(): Promise<void> {
	await rm(TEMP_DIR, { recursive: true, force: true });
}

describe('interviewService', () => {
	test('parses questions and returns all as unanswered when no responses exist', async () => {
		const dir = await setupTempProject();
		try {
			const detail = await getProjectInterviewDetail(dir);
			expect(detail.hasQuestionsFile).toBe(true);
			expect(detail.total).toBe(3);
			expect(detail.answered).toBe(0);
			expect(detail.unanswered.length).toBe(3);
			expect(detail.answeredQuestions.length).toBe(0);
			expect(detail.unanswered[0]?.id).toBe('q-1');
			expect(detail.unanswered[0]?.priority).toBe('HIGH');
		} finally {
			await cleanupTempProject();
		}
	});

	test('submits an answer and verifies round-trip', async () => {
		const dir = await setupTempProject();
		try {
			const detail = await submitProjectInterviewAnswer(dir, {
				answer: 'To build a great product.',
				questionId: 'q-1',
			});
			expect(detail.answered).toBe(1);
			expect(detail.unanswered.length).toBe(2);
			expect(detail.answeredQuestions.length).toBe(1);
			expect(detail.answeredQuestions[0]?.response).toBe('To build a great product.');
			expect(detail.answeredQuestions[0]?.prompt).toBe(
				'What is the primary goal of this project?'
			);

			const responsesPath = join(dir, '.aidd', 'responses.md');
			const responsesContent = await readFile(responsesPath, 'utf8');
			expect(responsesContent).toContain('**[HIGH]**');
			expect(responsesContent).toContain('Response: To build a great product.');
		} finally {
			await cleanupTempProject();
		}
	});

	test('rejects unknown question ids', async () => {
		const dir = await setupTempProject();
		try {
			try {
				await submitProjectInterviewAnswer(dir, {
					answer: 'test',
					questionId: 'q-99',
				});
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error instanceof Error && error.message).toContain('Unknown question id');
			}
		} finally {
			await cleanupTempProject();
		}
	});

	test('rejects empty answers', async () => {
		const dir = await setupTempProject();
		try {
			try {
				await submitProjectInterviewAnswer(dir, {
					answer: '   ',
					questionId: 'q-2',
				});
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error instanceof Error && error.message).toContain('empty');
			}
		} finally {
			await cleanupTempProject();
		}
	});

	test('skips Legend and Summary sections when parsing questions', async () => {
		const dir = TEMP_DIR;
		try {
			await mkdir(join(dir, '.aidd'), { recursive: true });
			const fixture = [
				'# Onboarding Interview',
				'',
				'## Legend',
				'',
				'- **[CRITICAL]** Must answer before changing ownership.',
				'- **[HIGH]** Significantly de-risks maintenance.',
				'- **[NICE]** Useful context when time allows.',
				'',
				'---',
				'',
				'## 1. Product Intent',
				'',
				'- **[CRITICAL]** What exact behavior must be true before release?',
				'  Continuation text for the first question.',
				'- **[HIGH]** Who has final say on contract changes?',
				'',
				'## Summary',
				'',
				'- **[CRITICAL]** Summary bullet that must not be parsed.',
				'',
			].join('\n');
			await writeFile(join(dir, '.aidd', 'questions.md'), fixture, 'utf8');

			const detail = await getProjectInterviewDetail(dir);
			expect(detail.total).toBe(2);
			expect(detail.unanswered[0]?.priority).toBe('CRITICAL');
			expect(detail.unanswered[0]?.prompt).toBe(
				'What exact behavior must be true before release? Continuation text for the first question.'
			);
			expect(detail.unanswered[1]?.priority).toBe('HIGH');
			expect(detail.unanswered[1]?.prompt).toBe('Who has final say on contract changes?');

			const answered = await submitProjectInterviewAnswer(dir, {
				answer: 'A documented decision.',
				questionId: 'q-1',
			});
			expect(answered.answered).toBe(1);
			expect(answered.answeredQuestions[0]?.prompt).toBe(
				'What exact behavior must be true before release? Continuation text for the first question.'
			);
			const responsesPath = join(dir, '.aidd', 'responses.md');
			const responsesContent = await readFile(responsesPath, 'utf8');
			expect(responsesContent).not.toContain('Must answer before changing ownership');
			expect(responsesContent).not.toContain('Summary bullet');
		} finally {
			await cleanupTempProject();
		}
	});

	test('binds answer to the right question id when only a later question is answered', async () => {
		const dir = await setupTempProject();
		try {
			// Answer only the second question (q-2). responses.md will hold a single
			// entry; a positional join would misbind it to q-1 (file index 0).
			const detail = await submitProjectInterviewAnswer(dir, {
				answer: 'Developers and operators.',
				questionId: 'q-2',
			});

			expect(detail.answered).toBe(1);
			expect(detail.answeredQuestions.length).toBe(1);
			expect(detail.answeredQuestions[0]?.id).toBe('q-2');
			expect(detail.answeredQuestions[0]?.prompt).toBe('What is the target audience?');
			expect(detail.answeredQuestions[0]?.response).toBe('Developers and operators.');

			const unansweredIds = detail.unanswered.map((q) => q.id);
			expect(unansweredIds).toEqual(['q-1', 'q-3']);

			// Re-read from disk: the on-disk responses.md must round-trip to the same id.
			const reread = await getProjectInterviewDetail(dir);
			expect(reread.answeredQuestions.length).toBe(1);
			expect(reread.answeredQuestions[0]?.id).toBe('q-2');
			expect(reread.answeredQuestions[0]?.response).toBe('Developers and operators.');
		} finally {
			await cleanupTempProject();
		}
	});

	test('keeps answers bound to their ids when questions are answered out of order', async () => {
		const dir = await setupTempProject();
		try {
			await submitProjectInterviewAnswer(dir, {
				answer: 'Blue and slate.',
				questionId: 'q-3',
			});
			const detail = await submitProjectInterviewAnswer(dir, {
				answer: 'Ship a great product.',
				questionId: 'q-1',
			});

			expect(detail.answered).toBe(2);
			const byId = new Map(detail.answeredQuestions.map((q) => [q.id, q.response]));
			expect(byId.get('q-1')).toBe('Ship a great product.');
			expect(byId.get('q-3')).toBe('Blue and slate.');
			expect(detail.unanswered.map((q) => q.id)).toEqual(['q-2']);

			const reread = await getProjectInterviewDetail(dir);
			const rereadById = new Map(reread.answeredQuestions.map((q) => [q.id, q.response]));
			expect(rereadById.get('q-1')).toBe('Ship a great product.');
			expect(rereadById.get('q-3')).toBe('Blue and slate.');
		} finally {
			await cleanupTempProject();
		}
	});

	test('updates answer in-place (idempotent)', async () => {
		const dir = await setupTempProject();
		try {
			await submitProjectInterviewAnswer(dir, {
				answer: 'First answer.',
				questionId: 'q-1',
			});
			const first = await submitProjectInterviewAnswer(dir, {
				answer: 'Updated answer.',
				questionId: 'q-1',
			});
			expect(first.answered).toBe(1);
			expect(first.answeredQuestions[0]?.response).toBe('Updated answer.');

			const second = await getProjectInterviewDetail(dir);
			expect(second.answered).toBe(1);
			expect(second.answeredQuestions[0]?.response).toBe('Updated answer.');
		} finally {
			await cleanupTempProject();
		}
	});
});
