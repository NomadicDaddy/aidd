import { parseQuestionBullets } from 'aidd-shared/interview/question-bullets';

import type { ProjectInterviewQuestionDto } from '../../types.ts';

// The bullet grammar lives in aidd-shared so the CLI interview run reads questions.md exactly as
// the panel does; responsesFile.ts uses it to find where one entry ends and the next begins.
export { QUESTION_BULLET_LINE } from 'aidd-shared/interview/question-bullets';

/**
 * Parse `questions.md` into the ordered question list the interview UI renders.
 * @param content Raw `questions.md` text.
 * @returns Every question bullet outside a Legend or Summary section, in file order.
 */
export function parseQuestions(content: string): ProjectInterviewQuestionDto[] {
	return parseQuestionBullets(content).map((question, index) => ({
		id: `q-${String(index + 1)}`,
		priority: question.priority,
		prompt: question.prompt,
	}));
}
