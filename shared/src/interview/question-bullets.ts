/**
 * The interview questionnaire grammar, shared by the CLI interview run and the web panel.
 *
 * `questions.md` (and the question half of `responses.md`) identifies each question with a
 * `- **[PRIORITY]** prompt` bullet under category headings. A prompt may wrap onto indented
 * continuation lines, which belong to the same question. Two copies of this reading once drifted:
 * the CLI kept only lines ending in `?`, so a wrapped question lost everything before its last
 * line and the numbering stopped matching the panel's.
 */
export const QUESTION_BULLET_LINE = /^\s*[-*]\s+\*\*\[([^\]]+)\]\*\*\s*(.*)$/;

export interface QuestionBullet {
	priority: string;
	prompt: string;
}

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
 * Every question bullet outside a Legend or Summary section, in file order, with wrapped
 * continuation lines joined onto their prompt.
 */
export function parseQuestionBullets(content: string): QuestionBullet[] {
	const questions: QuestionBullet[] = [];
	let current: null | QuestionBullet = null;
	let skipSection = false;
	for (const rawLine of content.split('\n')) {
		const line = rawLine.replace(/\r$/, '');
		const heading = HEADING_LINE.exec(line);
		if (heading) {
			if (current) questions.push(current);
			current = null;
			skipSection = isSkippedSectionTitle(heading[2] ?? '');
			continue;
		}
		if (skipSection) continue;
		const bullet = QUESTION_BULLET_LINE.exec(line);
		if (bullet) {
			if (current) questions.push(current);
			current = { priority: (bullet[1] ?? '').trim(), prompt: (bullet[2] ?? '').trim() };
			continue;
		}
		if (current && /^\s+\S/.test(line)) {
			const continuation = line.trim();
			current.prompt = current.prompt ? `${current.prompt} ${continuation}` : continuation;
		}
	}
	if (current) questions.push(current);
	return questions;
}
