import {
	renderInterviewIndex,
	renderResponseDocument,
	responseFileName,
} from 'aidd-shared/interview/response-files';
import { metadataPath } from 'aidd-shared/metadata/paths';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
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
import { parseResponsesFromDisk } from './interview/responsesFile.ts';

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
 * (priority, prompt) signature and key the result by `question.id`. A CLI document whose question
 * carries no bullet is the exception: its number is its place in questions.md itself, not in
 * responses.md, so it binds to that question directly.
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
		if (entry.number !== undefined) {
			const question = questions[entry.number - 1];
			if (question && !consumed.has(question.id)) {
				consumed.add(question.id);
				byId.set(question.id, entry);
			}
			continue;
		}
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

	const parsedResponses = await parseResponsesFromDisk(metadataDir, responsesContent ?? '');
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
	const existing = (await readTextOrNull(responsesPath)) ?? '';
	const parsedResponses = await parseResponsesFromDisk(metadataDir, existing);
	const responsesById = resolveResponsesById(questions, parsedResponses);
	const previousFile = responsesById.get(question.id)?.file;
	responsesById.set(question.id, {
		priority: question.priority,
		prompt: question.prompt,
		response: trimmedAnswer,
	});

	// Every answer lives in responses/responseN.md, as the CLI keeps it, and responses.md is the
	// index over those files: the CLI rewrites that index from the files, so an answer kept only
	// inline would be erased by its next run. Answers already in a file stay where they are. This
	// answer, and any answer still inline, go to their question's file, which must be empty or
	// already hold that answer: an older document there may answer other questions, and it is
	// never overwritten. Everything is checked before anything is written.
	const responsesDir = join(metadataDir, 'responses');
	const present = new Set(await readdir(responsesDir).catch(() => [] as string[]));
	const indexed = questions.map((q, index) => ({ number: index + 1, text: q.prompt }));
	const answered = new Set<number>();
	const writes: { content: string; name: string }[] = [];
	for (const [index, q] of questions.entries()) {
		const entry = responsesById.get(q.id);
		const indexedQuestion = indexed[index];
		if (!entry || !indexedQuestion) continue;
		answered.add(indexedQuestion.number);
		const isThisAnswer = q.id === question.id;
		if (!isThisAnswer && entry.file !== undefined) continue;
		const name = responseFileName(indexedQuestion.number);
		const source = isThisAnswer ? previousFile : entry.file;
		if (present.has(name) && source !== `responses/${name}`) {
			throw new Error(
				`responses/${name} holds an answer recorded for another question, so it was not ` +
					`overwritten; move it before answering question ${String(indexedQuestion.number)} here`,
			);
		}
		writes.push({ content: renderResponseDocument(indexedQuestion, entry.response), name });
	}
	await mkdir(responsesDir, { recursive: true });
	for (const { content, name } of writes) {
		await writeFile(join(responsesDir, name), content, 'utf8');
	}
	await writeFile(responsesPath, renderInterviewIndex(indexed, answered), 'utf8');

	return await getProjectInterviewDetail(projectDir);
}
