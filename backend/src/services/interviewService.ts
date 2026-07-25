import { metadataPath } from 'aidd-shared/metadata/paths';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
	AnsweredInterviewQuestionDto,
	ProjectInterviewDetailDto,
	ProjectInterviewProgress,
	ProjectInterviewQuestionDto,
} from '../types.ts';

import { readTextOrNull } from './fsHelpers.ts';

const QUESTION_LINE = /^\s*[-*]\s+\*\*\[([^\]]+)\]\*\*\s*(.*)$/;
const RESPONSE_LINE = /^\s+Response:\s(.*)$/;
const HEADING_LINE = /^(#{1,6})\s+(.*)$/;
const SKIPPED_SECTION_TITLES = new Set(['legend', 'summary']);

function isSkippedSectionTitle(title: string): boolean {
	const normalized = title
		.trim()
		.toLowerCase()
		.replace(/[:.\s]+$/, '');
	return SKIPPED_SECTION_TITLES.has(normalized);
}

function parseQuestions(content: string): ProjectInterviewQuestionDto[] {
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
		const match = QUESTION_LINE.exec(line);
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

interface ParsedResponseEntry {
	priority: string;
	prompt: string;
	response: string;
}

function questionMatchKey(priority: string, prompt: string): string {
	return `${priority}${prompt}`;
}

function parseResponses(content: string): ParsedResponseEntry[] {
	const responses: ParsedResponseEntry[] = [];
	const lines = content.split('\n');
	let current: null | ParsedResponseEntry = null;

	for (const rawLine of lines) {
		const line = rawLine.replace(/\r$/, '');
		const questionMatch = QUESTION_LINE.exec(line);
		if (questionMatch) {
			if (current !== null) {
				current.response = current.response.trim();
				responses.push(current);
			}
			current = {
				priority: (questionMatch[1] ?? '').trim(),
				prompt: (questionMatch[2] ?? '').trim(),
				response: '',
			};
			continue;
		}
		const responseMatch = RESPONSE_LINE.exec(line);
		if (responseMatch && current !== null) {
			current.response = (responseMatch[1] ?? '').trim();
			continue;
		}
	}

	if (current !== null) {
		current.response = current.response.trim();
		responses.push(current);
	}

	return responses;
}

/**
 * Bind parsed responses to questions by the question's stable id.
 *
 * responses.md and questions.md are independent index spaces (responses.md only
 * holds answered questions), so a positional join silently misbinds answers when
 * the lists diverge. Resolve each response to a not-yet-matched question by its
 * (priority, prompt) signature and key the result by `question.id`.
 * @param questions
 * @param parsed
 * @returns A map from question id to its matching response entry.
 */
function resolveResponsesById(
	questions: ProjectInterviewQuestionDto[],
	parsed: ParsedResponseEntry[],
): Map<string, ParsedResponseEntry> {
	const byId = new Map<string, ParsedResponseEntry>();
	const consumed = new Set<string>();
	for (const entry of parsed) {
		const key = questionMatchKey(entry.priority, entry.prompt);
		const question = questions.find(
			(q) => !consumed.has(q.id) && questionMatchKey(q.priority, q.prompt) === key,
		);
		if (!question) continue;
		consumed.add(question.id);
		byId.set(question.id, entry);
	}
	return byId;
}

export async function getProjectInterviewDetail(
	projectDir: string,
): Promise<ProjectInterviewDetailDto> {
	const metadataDir = metadataPath(projectDir);
	const questionsContent = await readTextOrNull(join(metadataDir, 'questions.md'));
	if (questionsContent === null) {
		return {
			answered: 0,
			answeredQuestions: [],
			hasQuestionsFile: false,
			total: 0,
			unanswered: [],
		};
	}
	const questions = parseQuestions(questionsContent);

	const responsesContent = await readTextOrNull(join(metadataDir, 'responses.md'));
	const responsesById = resolveResponsesById(
		questions,
		responsesContent ? parseResponses(responsesContent) : [],
	);

	const answeredQuestions: AnsweredInterviewQuestionDto[] = [];
	const unanswered: ProjectInterviewQuestionDto[] = [];

	for (const question of questions) {
		const responseEntry = responsesById.get(question.id);
		if (responseEntry && responseEntry.response.length > 0) {
			answeredQuestions.push({
				id: question.id,
				priority: question.priority,
				prompt: question.prompt,
				response: responseEntry.response,
			});
		} else {
			unanswered.push(question);
		}
	}

	const answered = answeredQuestions.length;
	return {
		answered,
		answeredQuestions,
		hasQuestionsFile: true,
		total: questions.length,
		unanswered,
	};
}

export async function getProjectInterviewProgress(
	projectDir: string,
): Promise<null | ProjectInterviewProgress> {
	const detail = await getProjectInterviewDetail(projectDir);
	if (!detail.hasQuestionsFile) return null;
	return { answered: detail.answered, total: detail.total };
}

export async function submitProjectInterviewAnswer(
	projectDir: string,
	body: { answer: string; questionId: string },
): Promise<ProjectInterviewDetailDto> {
	const metadataDir = metadataPath(projectDir);

	const questionsContent = await readTextOrNull(join(metadataDir, 'questions.md'));
	if (questionsContent === null) {
		throw new Error('No questions.md found for this project');
	}

	const questions = parseQuestions(questionsContent);
	const question = questions.find((q) => q.id === body.questionId);
	if (!question) {
		throw new Error(`Unknown question id: ${body.questionId}`);
	}
	const trimmedAnswer = body.answer.trim();
	if (trimmedAnswer.length === 0) {
		throw new Error('Answer must not be empty');
	}

	const responsesPath = join(metadataDir, 'responses.md');
	const existing = await readTextOrNull(responsesPath);
	const responsesById = resolveResponsesById(questions, existing ? parseResponses(existing) : []);

	responsesById.set(question.id, {
		priority: question.priority,
		prompt: question.prompt,
		response: trimmedAnswer,
	});

	const lines: string[] = [];
	for (const q of questions) {
		const entry = responsesById.get(q.id);
		if (!entry) continue;
		lines.push(`- **[${q.priority}]** ${q.prompt}`);
		lines.push(`  Response: ${entry.response}`);
		lines.push('');
	}

	await writeFile(responsesPath, lines.join('\n'), 'utf8');

	return await getProjectInterviewDetail(projectDir);
}
