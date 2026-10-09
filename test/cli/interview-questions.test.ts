import { describe, expect, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseQuestions } from '../../backend/src/services/interview/questionsFile.ts';
import { readInterviewQuestions } from '../../cli/src/modes/interview-questions.ts';
import { testTempDir } from '../_helpers/temp.ts';

// The onboarding questionnaire shape: category headings, Legend and Summary sections, and bullets
// whose prompts wrap onto indented lines. The CLI once kept only lines ending in "?", so the first
// question below came back as its last line alone and the count disagreed with the panel's.
const questionnaire = [
	'# Onboarding Interview: Sample',
	'',
	'### Legend',
	'',
	'- **[CRITICAL]** Must answer before assuming ownership',
	'',
	'### 1. Product Intent',
	'',
	'- **[HIGH]** What would have to be true after the trip for the next release',
	'  to complete before the release counts as useful?',
	'- **[NICE]** Who else reads the booklet?',
	'',
	'### 2. Operations',
	'',
	'- **[CRITICAL]** Which commit carried the rewrite, and was any of it left',
	'  unfinished when it landed?',
	'',
	'### Summary',
	'',
	'- **Total questions**: 3 (1 critical / 1 high / 1 nice)',
	'',
].join('\n');

async function questionsFrom(content: string) {
	const dir = await testTempDir('interview-questions-');
	const path = join(dir, 'questions.md');
	await writeFile(path, content);
	return await readInterviewQuestions(path);
}

describe('readInterviewQuestions', () => {
	test('reads wrapped question bullets whole, skipping Legend and Summary', async () => {
		const questions = await questionsFrom(questionnaire);
		expect(questions.map((question) => question.text)).toEqual([
			'What would have to be true after the trip for the next release to complete before the release counts as useful?',
			'Who else reads the booklet?',
			'Which commit carried the rewrite, and was any of it left unfinished when it landed?',
		]);
		expect(questions.map((question) => question.number)).toEqual([1, 2, 3]);
	});

	test('numbers questions exactly as the panel does', async () => {
		const cli = await questionsFrom(questionnaire);
		const panel = parseQuestions(questionnaire);
		expect(cli.map((question) => question.text)).toEqual(
			panel.map((question) => question.prompt),
		);
	});

	test('still reads one ## section per question when there are no bullets', async () => {
		const questions = await questionsFrom(
			'## Legend\n\nignored?\n\n## Scope\n\nWhat is in scope?\n\n## Risks\n\nWhat worries you?\n',
		);
		expect(questions).toHaveLength(2);
		expect(questions[0]?.text).toStartWith('## Scope');
	});

	test('falls back to bare question lines', async () => {
		const questions = await questionsFrom('Notes first.\nWhat is next?\nAnd after that?\n');
		expect(questions.map((question) => question.text)).toEqual([
			'What is next?',
			'And after that?',
		]);
	});
});
