import type { ProjectInterviewQuestionDto } from '../../types.ts';

/**
 * The question bullet grammar, shared by `questions.md` and `responses.md`.
 *
 * Both files identify a question by the same `- **[PRIORITY]** prompt` bullet, and the responses
 * parser has to recognize it to know where one entry ends and the next begins, so the pattern is
 * declared once here rather than copied into each parser.
 */
export const QUESTION_BULLET_LINE = /^\s*[-*]\s+\*\*\[([^\]]+)\]\*\*\s*(.*)$/;

const HEADING_LINE = /^(#{1,6})\s+(.*)$/;
const SKIPPED_SECTION_TITLES = new Set(['legend', 'summary']);

function isSkippedSectionTitle(title: string): boolean {
	const normalized = title
		.trim()
		.toLowerCase()
		.replace(/[:.\s]+$/, '');
	return SKIPPED_SECTION_TITLES.has(normalized);
}

/**
 * Parse `questions.md` into the ordered question list the interview UI renders.
 * @param content Raw `questions.md` text.
 * @returns Every question bullet outside a Legend or Summary section, in file order.
 */
export function parseQuestions(content: string): ProjectInterviewQuestionDto[] {
	const questions: ProjectInterviewQuestionDto[] = [];
	const lines = content.split('\n');
	let buffer: null | ProjectInterviewQuestionDto = null;
	let skipSection = false;
	for (const rawLine of lines) {
		const line = rawLine.replace(/\r$/, '');
		const headingMatch = HEADING_LINE.exec(line);
		if (headingMatch) {
			if (buffer) {
				questions.push(buffer);
				buffer = null;
			}
			skipSection = isSkippedSectionTitle(headingMatch[2] ?? '');
			continue;
		}
		if (skipSection) continue;
		const match = QUESTION_BULLET_LINE.exec(line);
		if (match) {
			if (buffer) questions.push(buffer);
			const priority = (match[1] ?? '').trim();
			const prompt = (match[2] ?? '').trim();
			buffer = { id: `q-${questions.length + 1}`, priority, prompt };
			continue;
		}
		if (buffer && /^\s+\S/.test(line)) {
			const continuation = line.trim();
			if (continuation.length > 0) {
				buffer.prompt = buffer.prompt ? `${buffer.prompt} ${continuation}` : continuation;
			}
		}
	}
	if (buffer) questions.push(buffer);
	return questions;
}
