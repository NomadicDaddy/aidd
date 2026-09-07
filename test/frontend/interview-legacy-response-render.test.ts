import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { getProjectInterviewDetail } from '../../backend/src/services/interviewService.ts';

import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../backend/_helpers/remove-temp-tree.ts';

function renderInterview(interview: Awaited<ReturnType<typeof getProjectInterviewDetail>>): string {
	const script = `
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { PageRail } from './src/components/shared/PageRail.tsx';
import { InterviewTab } from './src/pages/projects/detail/InterviewTab.tsx';

const client = new QueryClient();
const interview = ${JSON.stringify(interview)};
console.log(renderToStaticMarkup(
	createElement(
		QueryClientProvider,
		{ client },
		createElement(
			MemoryRouter,
			null,
			createElement(
				PageRail,
				{ rail: 'bounded' },
				createElement(InterviewTab, {
					draftAnswers: {},
					interview,
					isError: false,
					isLoading: false,
					onDraftChange: () => {},
					onDraftSubmitted: () => {},
					projectId: 'legacy-fixture',
				}),
			),
		),
	),
));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout);
}

describe('legacy interview response rendering', () => {
	test('renders linked answers instead of the false empty state', async () => {
		const dir = await testTempDir('interview-legacy-render-');
		try {
			const metadataDir = join(dir, '.aidd');
			const responsesDir = join(metadataDir, 'responses');
			await mkdir(responsesDir, { recursive: true });
			await writeFile(
				join(metadataDir, 'questions.md'),
				[
					'- **[HIGH]** What should this project accomplish?',
					'- **[MED]** Who is it for?',
				].join('\n'),
				'utf8',
			);
			await writeFile(
				join(metadataDir, 'responses.md'),
				[
					'# Interview Responses',
					'',
					'| # | Question | Status | Response |',
					'|---|----------|--------|----------|',
					'| 1 | Product | Done | [response1.md](responses/response1.md) |',
				].join('\n'),
				'utf8',
			);
			await writeFile(
				join(responsesDir, 'response1.md'),
				[
					'# Question 1: Product',
					'',
					'## Question',
					'',
					'- **[HIGH]** What should this project accomplish?',
					'- **[MED]** Who is it for?',
					'',
					'## Response',
					'',
					'It should help local developers ship safely.',
				].join('\n'),
				'utf8',
			);

			const interview = await getProjectInterviewDetail(dir);
			const html = renderInterview(interview);

			expect(interview.answered).toBe(2);
			expect(interview.unanswered).toEqual([]);
			expect(html).toContain('2/2 answered');
			expect(html).toContain('All interview questions have responses.');
			expect(html).toContain('Answered questions');
			expect(html).toContain('It should help local developers ship safely.');
			expect(html).not.toContain('No questions match the active filters.');
		} finally {
			await removeTempTree(dir);
		}
	});

	test('keeps a genuinely empty responses file in the unanswered state', async () => {
		const dir = await testTempDir('interview-empty-render-');
		try {
			const metadataDir = join(dir, '.aidd');
			await mkdir(metadataDir, { recursive: true });
			await writeFile(
				join(metadataDir, 'questions.md'),
				'- **[HIGH]** What should this project accomplish?\n',
				'utf8',
			);
			await writeFile(join(metadataDir, 'responses.md'), '', 'utf8');

			const interview = await getProjectInterviewDetail(dir);
			const html = renderInterview(interview);

			expect(interview.answered).toBe(0);
			expect(interview.unanswered).toHaveLength(1);
			expect(html).toContain('0/1 answered');
			expect(html).toContain('What should this project accomplish?');
			expect(html).not.toContain('Answered questions');
		} finally {
			await removeTempTree(dir);
		}
	});
});
