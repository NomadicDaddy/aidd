import { describe, expect, test } from 'bun:test';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	getProjectInterviewDetail,
	submitProjectInterviewAnswer,
} from '../../backend/src/services/interviewService.ts';

import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

// An older CLI wrote one document per category, so response1.md may answer several questions.
// Editing one of them must not overwrite the others' answer (Roger #18119 on de2fcd75).

const QUESTIONS = `- **[HIGH]** What is the primary goal of this project?
- **[MED]** What is the target audience?
- **[LOW]** What color scheme do you prefer?
`;

const SHARED = [
	'# Question',
	'',
	'## Question',
	'',
	'- **[HIGH]** What is the primary goal of this project?',
	'- **[MED]** What is the target audience?',
	'',
	'## Response',
	'',
	'Build a focused product for developers.',
	'',
].join('\n');

async function projectWith(files: Record<string, string>): Promise<string> {
	const dir = await testTempDir('interview-shared-source-');
	const metadataDir = join(dir, '.aidd');
	await mkdir(join(metadataDir, 'responses'), { recursive: true });
	await writeFile(join(metadataDir, 'questions.md'), QUESTIONS, 'utf8');
	for (const [path, content] of Object.entries(files)) {
		await writeFile(join(metadataDir, ...path.split('/')), content, 'utf8');
	}
	return dir;
}

async function answers(dir: string): Promise<Map<string, string>> {
	const detail = await getProjectInterviewDetail(dir);
	return new Map(detail.answeredQuestions.map((q) => [q.id, q.response]));
}

describe('editing an answer whose document answers other questions too', () => {
	test('moves the other answers to their own files before replacing the document', async () => {
		const dir = await projectWith({ 'responses/response1.md': SHARED });
		try {
			await submitProjectInterviewAnswer(dir, { answer: 'Ship a CLI.', questionId: 'q-1' });
			expect(await answers(dir)).toEqual(
				new Map([
					['q-1', 'Ship a CLI.'],
					['q-2', 'Build a focused product for developers.'],
				]),
			);
			const moved = await readFile(join(dir, '.aidd', 'responses', 'response2.md'), 'utf8');
			expect(moved).toContain('## Response\n\nBuild a focused product for developers.\n');
		} finally {
			await removeTempTree(dir);
		}
	});

	test('refuses before writing when another answer has nowhere to move', async () => {
		// q-2 would move to response2.md, which already answers q-3.
		const occupied = SHARED.replace(
			'- **[HIGH]** What is the primary goal of this project?\n- **[MED]** What is the target audience?',
			'- **[LOW]** What color scheme do you prefer?',
		).replace('Build a focused product for developers.', 'Blue and slate.');
		const dir = await projectWith({
			'responses/response1.md': SHARED,
			'responses/response2.md': occupied,
		});
		try {
			const before = await answers(dir);
			let refusal = '';
			try {
				await submitProjectInterviewAnswer(dir, {
					answer: 'Ship a CLI.',
					questionId: 'q-1',
				});
			} catch (error) {
				refusal = error instanceof Error ? error.message : String(error);
			}
			expect(refusal).toContain(
				'responses/response2.md holds an answer recorded for another',
			);
			expect(await readFile(join(dir, '.aidd', 'responses', 'response1.md'), 'utf8')).toBe(
				SHARED,
			);
			expect(await answers(dir)).toEqual(before);
		} finally {
			await removeTempTree(dir);
		}
	});

	test('moves the other answers before replacing the document, so a failed write loses none', async () => {
		// Morticia #18210: if the replaced document were written first and a later write failed,
		// q-2's only copy would be gone. A read-only document makes the saved write fail.
		const dir = await projectWith({ 'responses/response1.md': SHARED });
		const shared = join(dir, '.aidd', 'responses', 'response1.md');
		try {
			await chmod(shared, 0o444);
			let failed = false;
			try {
				await submitProjectInterviewAnswer(dir, {
					answer: 'Ship a CLI.',
					questionId: 'q-1',
				});
			} catch {
				failed = true;
			}
			expect(failed).toBe(true);
			const moved = await readFile(join(dir, '.aidd', 'responses', 'response2.md'), 'utf8');
			expect(moved).toContain('Build a focused product for developers.');
			expect(await readFile(shared, 'utf8')).toBe(SHARED);
		} finally {
			await chmod(shared, 0o644);
			await removeTempTree(dir);
		}
	});
});
