import { metadataPath } from 'aidd-shared/metadata/paths';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
	AnsweredInterviewQuestionDto,
	ProjectInterviewDetailDto,
	ProjectInterviewProgress,
	ProjectInterviewQuestionDto,
} from '../types.ts';
import type { ParsedResponseEntry } from './interview/responsesFile.ts';

import { readTextOrNull } from './fsHelpers.ts';
import { parseQuestions } from './interview/questionsFile.ts';
import { parseResponsesFromDisk, serializeResponses } from './interview/responsesFile.ts';

function questionMatchKey(priority: string, prompt: string): string {
	const normalizedPrompt = prompt
		.normalize('NFKC')
		.replaceAll('→', '->')
		.replace(/[‐‑‒–—―-]+/g, '-')
		.replace(/[“”]/g, '"')
		.replace(/[‘’]/g, "'")
		.replace(/\s+/g, ' ')
		.trim();
	return `${priority.trim().toUpperCase()}\u0000${normalizedPrompt}`;
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
	const [questionsContent, responsesContent] = await Promise.all([
		readTextOrNull(join(metadataDir, 'questions.md')),
		readTextOrNull(join(metadataDir, 'responses.md')),
	]);
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

	const parsedResponses = responsesContent
		? await parseResponsesFromDisk(metadataDir, responsesContent)
		: [];
	const responsesById = resolveResponsesById(questions, parsedResponses);

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
	const parsedResponses = existing ? await parseResponsesFromDisk(metadataDir, existing) : [];
	const responsesById = resolveResponsesById(questions, parsedResponses);

	responsesById.set(question.id, {
		priority: question.priority,
		prompt: question.prompt,
		response: trimmedAnswer,
	});

	// Rewrite the whole file from the parsed entries, so every answer this save did not touch is
	// re-emitted from what the parser read rather than from a lossy summary of it.
	const entries: ParsedResponseEntry[] = [];
	for (const q of questions) {
		const entry = responsesById.get(q.id);
		if (entry)
			entries.push({ priority: q.priority, prompt: q.prompt, response: entry.response });
	}

	await writeFile(responsesPath, serializeResponses(entries), 'utf8');

	return await getProjectInterviewDetail(projectDir);
}
