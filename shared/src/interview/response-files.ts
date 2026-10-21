/**
 * The interview's answer files, shared by the CLI interview run and the web panel.
 *
 * A question is answered when `.aidd/responses/responseN.md` exists, N being its place in
 * questions.md, and `responses.md` is an index regenerated from those files. Both writers use these
 * renderers: the panel once kept its answers inline in responses.md, and the next CLI run, which
 * rewrites the index from the files, erased them.
 */

export interface IndexedQuestion {
	number: number;
	text: string;
}

export function responseFileName(questionNumber: number): string {
	return `response${String(questionNumber)}.md`;
}

/**
 * A question's first line without a `## ` heading marker.
 * @param question The question text or section.
 * @returns Its title, or `Question` when it has none.
 */
export function questionTitle(question: string): string {
	return (
		question
			.split(/\r?\n/)[0]
			?.replace(/^##\s*/, '')
			.trim() || 'Question'
	);
}

function truncateQuestion(question: string): string {
	const text = question
		.replace(/^##\s*/, '')
		.trim()
		.replaceAll('|', '\\|');
	return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

/**
 * One answer file: a title, the question's text and the answer, which the panel's reader binds back
 * to question N by the file's number.
 * @param question The question and its number.
 * @param response The answer's Markdown.
 * @returns The file's complete text.
 */
export function renderResponseDocument(question: IndexedQuestion, response: string): string {
	return [
		`# Question ${String(question.number)}: ${questionTitle(question.text)}`,
		'',
		'## Question',
		'',
		question.text,
		'',
		'## Response',
		'',
		// The reader strips a trailing CR from every line, so CRLF is normalized here.
		response.replace(/\r\n?/g, '\n').trim(),
		'',
	].join('\n');
}

/**
 * The `responses.md` progress table over every question, linking the answered ones.
 * @param questions Every question, in questions.md order.
 * @param answered The numbers whose answer file exists.
 * @returns The index file's complete text.
 */
export function renderInterviewIndex(
	questions: readonly IndexedQuestion[],
	answered: ReadonlySet<number>,
): string {
	const rows = questions.map((question) => {
		const name = responseFileName(question.number);
		const done = answered.has(question.number);
		return `| ${String(question.number)} | ${truncateQuestion(question.text)} | ${
			done ? 'Done' : 'Pending'
		} | ${done ? `[${name}](responses/${name})` : '-'} |`;
	});
	const doneCount = questions.filter((question) => answered.has(question.number)).length;
	return [
		'# Interview Responses',
		'',
		'| # | Question | Status | Response |',
		'|---|----------|--------|----------|',
		...rows,
		'',
		`**Progress:** ${String(doneCount)} / ${String(questions.length)} questions answered`,
		'',
	].join('\n');
}
