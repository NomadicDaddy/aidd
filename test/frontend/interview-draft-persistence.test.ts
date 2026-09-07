import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
	clearInterviewDraft,
	draftsForProject,
	storeInterviewDraft,
} from '../../frontend/src/pages/projects/detail/useInterviewDrafts.ts';

const frontendSource = resolve(import.meta.dir, '../../frontend/src');

describe('project interview draft persistence', () => {
	test('keeps drafts across panel lifecycles and isolates them by project', () => {
		const withDraft = storeInterviewDraft({}, 'project-one', 'question-one', 'rough answer');

		// Switching tabs unmounts only the panel; the page-owned map remains the same object.
		expect(draftsForProject(withDraft, 'project-one')).toEqual({
			'question-one': 'rough answer',
		});
		expect(draftsForProject(withDraft, 'project-two')).toEqual({});
	});

	test('preserves an explicit clear and only removes the submitted question', () => {
		const withDrafts = storeInterviewDraft(
			storeInterviewDraft({}, 'project-one', 'question-one', 'rough answer'),
			'project-one',
			'question-two',
			'second answer',
		);
		const explicitlyCleared = storeInterviewDraft(
			withDrafts,
			'project-one',
			'question-one',
			'',
		);
		expect(draftsForProject(explicitlyCleared, 'project-one')['question-one']).toBe('');

		const submitted = clearInterviewDraft(explicitlyCleared, 'project-one', 'question-one');
		expect(draftsForProject(submitted, 'project-one')).toEqual({
			'question-two': 'second answer',
		});
	});

	test('wires the page-owned drafts through the unmounting interview panel', async () => {
		const page = await readFile(
			resolve(frontendSource, 'pages/projects/ProjectDetailPage.tsx'),
			'utf8',
		);
		const panel = await readFile(
			resolve(frontendSource, 'pages/projects/detail/InterviewTab.tsx'),
			'utf8',
		);

		expect(page).toContain('useInterviewDrafts(project.data?.id)');
		expect(page).toContain('draftAnswers={interviewDrafts.drafts}');
		expect(page).toContain('onDraftChange={interviewDrafts.updateDraft}');
		expect(panel).not.toContain('useState<Record<string, string>>');
	});
});
