import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseResponses } from '../../backend/src/services/interview/responsesFile.ts';
import {
	getProjectInterviewDetail,
	submitProjectInterviewAnswer,
} from '../../backend/src/services/interviewService.ts';

import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

const QUESTIONS = `- **[HIGH]** What is the primary goal of this project?
- **[MED]** What is the target audience?
- **[LOW]** What color scheme do you prefer?
`;

const LEGACY_INDEX = `# Interview Responses

| # | Question | Status | Response |
|---|----------|--------|----------|
| 1 | Product intent | Done | [response1.md](responses/response1.md) |
| 2 | Visual direction | Done | [response2.md](responses/response2.md) |

**Progress:** 2 / 2 questions answered
`;

function responseDocument(questionLines: string[], response: string): string {
	return [
		'# Question',
		'',
		'## Question',
		'',
		...questionLines,
		'',
		'## Response',
		'',
		response,
		'',
	].join('\n');
}

function legacyDocuments(): Map<string, string> {
	return new Map([
		[
			'responses/response1.md',
			responseDocument(
				[
					'- **[HIGH]** What is the primary goal of this project?',
					'- **[MED]** What is the target audience?',
				],
				'Build a focused product for developers.',
			),
		],
		[
			'responses/response2.md',
			responseDocument(['- **[LOW]** What color scheme do you prefer?'], 'Blue and slate.'),
		],
	]);
}

async function setupLegacyProject(): Promise<string> {
	const dir = await testTempDir('interview-legacy-');
	const metadataDir = join(dir, '.aidd');
	const responsesDir = join(metadataDir, 'responses');
	await mkdir(responsesDir, { recursive: true });
	await writeFile(join(metadataDir, 'questions.md'), QUESTIONS, 'utf8');
	await writeFile(join(metadataDir, 'responses.md'), LEGACY_INDEX, 'utf8');
	for (const [path, content] of legacyDocuments()) {
		await writeFile(join(metadataDir, ...path.split('/')), content, 'utf8');
	}
	return dir;
}

describe('legacy interview responses', () => {
	test('parses linked CLI documents without mistaking table snippets for answers', () => {
		expect(parseResponses(LEGACY_INDEX, legacyDocuments())).toEqual([
			{
				priority: 'HIGH',
				prompt: 'What is the primary goal of this project?',
				response: 'Build a focused product for developers.',
			},
			{
				priority: 'MED',
				prompt: 'What is the target audience?',
				response: 'Build a focused product for developers.',
			},
			{
				priority: 'LOW',
				prompt: 'What color scheme do you prefer?',
				response: 'Blue and slate.',
			},
		]);
	});

	test('ignores response links outside the canonical response directory grammar', () => {
		const index = '| 1 | Unsafe | Done | [secret.md](../secret.md) |';
		expect(parseResponses(index, new Map([['../secret.md', 'secret']]))).toEqual([]);
	});

	test('loads every linked answer and migrates without losing untouched responses', async () => {
		const dir = await setupLegacyProject();
		try {
			const initial = await getProjectInterviewDetail(dir);
			expect(initial.answered).toBe(3);
			expect(initial.total).toBe(3);
			expect(initial.unanswered).toEqual([]);

			const updated = await submitProjectInterviewAnswer(dir, {
				answer: 'Slate with accessible contrast.',
				questionId: 'q-3',
			});
			const byId = new Map(
				updated.answeredQuestions.map((question) => [question.id, question]),
			);
			expect(byId.get('q-1')?.response).toBe('Build a focused product for developers.');
			expect(byId.get('q-2')?.response).toBe('Build a focused product for developers.');
			expect(byId.get('q-3')?.response).toBe('Slate with accessible contrast.');
		} finally {
			await removeTempTree(dir);
		}
	});

	test('matches linked prompts across typographic punctuation changes', async () => {
		const dir = await testTempDir('interview-legacy-punctuation-');
		try {
			const metadataDir = join(dir, '.aidd');
			await mkdir(join(metadataDir, 'responses'), { recursive: true });
			await writeFile(
				join(metadataDir, 'questions.md'),
				'- **[HIGH]** Is this hand-built — and does build → serve remain accurate?\n',
				'utf8',
			);
			await writeFile(
				join(metadataDir, 'responses.md'),
				'| 1 | Build | Done | [response1.md](responses/response1.md) |\n',
				'utf8',
			);
			await writeFile(
				join(metadataDir, 'responses', 'response1.md'),
				responseDocument(
					['- **[HIGH]** Is this hand-built -- and does build -> serve remain accurate?'],
					'Yes.',
				),
				'utf8',
			);

			const detail = await getProjectInterviewDetail(dir);
			expect(detail.answered).toBe(1);
			expect(detail.unanswered).toEqual([]);
			expect(detail.answeredQuestions[0]?.response).toBe('Yes.');
		} finally {
			await removeTempTree(dir);
		}
	});
});
