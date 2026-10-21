import {
	type IndexedQuestion,
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

/** The question being saved, and the file its previous answer was read from, if any. */
interface SavedAnswer {
	id: string;
	previousFile: string | undefined;
}

interface AnswerFilePlan {
	answered: Set<number>;
	writes: { content: string; name: string }[];
}

/**
 * Which answer files a save writes, checked in full before anything is written.
 *
 * Every answer lives in responses/responseN.md, as the CLI keeps it, and responses.md is the index
 * over those files: the CLI rewrites that index from the files, so an answer kept only inline would
 * be erased by its next run. Answers already in a file stay where they are. The saved answer, and
 * any answer still inline, go to their question's file, which must be empty or already hold that
 * answer: an older document there may answer other questions, and it is never overwritten. When
 * the saved answer replaces its own older document, the other answers that document held move to
 * their own files first, under the same rule.
 * @param indexed Every question with its number, in questions.md order.
 * @param questions The same questions, for their ids.
 * @param responsesById Every bound answer, the saved one included.
 * @param present The file names already in responses/.
 * @param saved The saved question's id and the file its previous answer came from.
 * @returns The answered numbers for the index and the files to write.
 */
function planAnswerFiles(
	indexed: readonly IndexedQuestion[],
	questions: readonly ProjectInterviewQuestionDto[],
	responsesById: ReadonlyMap<string, ParsedResponseEntry>,
	present: ReadonlySet<string>,
	saved: SavedAnswer,
): AnswerFilePlan {
	const plan: AnswerFilePlan = { answered: new Set(), writes: [] };
	const replaced = replacedDocument(indexed, questions, saved);
	for (const [index, q] of questions.entries()) {
		const entry = responsesById.get(q.id);
		const indexedQuestion = indexed[index];
		if (!entry || !indexedQuestion) continue;
		plan.answered.add(indexedQuestion.number);
		const isSaved = q.id === saved.id;
		if (!isSaved && staysInItsFile(entry, replaced)) continue;
		const name = responseFileName(indexedQuestion.number);
		assertFileFree(name, present, isSaved ? saved.previousFile : entry.file);
		plan.writes.push({
			content: renderResponseDocument(indexedQuestion, entry.response),
			name,
		});
	}
	return plan;
}

/**
 * The document a save overwrites with the saved answer: its previous source, when that is the
 * saved question's own file. An older document there may answer other questions too, and those
 * answers must move to their own files first.
 * @param indexed Every question with its number.
 * @param questions The same questions, for their ids.
 * @param saved The saved question and its previous source.
 * @returns The replaced document's path, or undefined when nothing is replaced.
 */
function replacedDocument(
	indexed: readonly IndexedQuestion[],
	questions: readonly ProjectInterviewQuestionDto[],
	saved: SavedAnswer,
): string | undefined {
	const number = indexed[questions.findIndex((q) => q.id === saved.id)]?.number;
	if (number === undefined) return undefined;
	const own = `responses/${responseFileName(number)}`;
	return saved.previousFile === own ? own : undefined;
}

/**
 * An answer in a file stays there, unless the save replaces that file.
 * @param entry The bound answer.
 * @param replaced The document the save overwrites, if any.
 * @returns Whether the answer is left where it is.
 */
function staysInItsFile(entry: ParsedResponseEntry, replaced: string | undefined): boolean {
	return entry.file !== undefined && entry.file !== replaced;
}

function assertFileFree(
	name: string,
	present: ReadonlySet<string>,
	source: string | undefined,
): void {
	if (!present.has(name) || source === `responses/${name}`) return;
	const number = /\d+/.exec(name)?.[0] ?? name;
	throw new Error(
		`responses/${name} holds an answer recorded for another question, so it was not ` +
			`overwritten; move it before answering question ${number} here`,
	);
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

	const existing = (await readTextOrNull(join(metadataDir, 'responses.md'))) ?? '';
	const parsedResponses = await parseResponsesFromDisk(metadataDir, existing);
	const responsesById = resolveResponsesById(questions, parsedResponses);
	const previousFile = responsesById.get(question.id)?.file;
	responsesById.set(question.id, {
		priority: question.priority,
		prompt: question.prompt,
		response: trimmedAnswer,
	});

	await writeAnswerFiles(metadataDir, questions, responsesById, {
		id: question.id,
		previousFile,
	});
	return await getProjectInterviewDetail(projectDir);
}

async function writeAnswerFiles(
	metadataDir: string,
	questions: readonly ProjectInterviewQuestionDto[],
	responsesById: ReadonlyMap<string, ParsedResponseEntry>,
	saved: SavedAnswer,
): Promise<void> {
	const responsesDir = join(metadataDir, 'responses');
	const present = new Set(await readdir(responsesDir).catch(() => [] as string[]));
	const indexed = questions.map((q, index) => ({ number: index + 1, text: q.prompt }));
	const { answered, writes } = planAnswerFiles(indexed, questions, responsesById, present, saved);
	// The saved answer's file is written last: when it replaces an older document that also held
	// other answers, those are already safe in their own files if a later write fails.
	const savedName = responseFileName(questions.findIndex((q) => q.id === saved.id) + 1);
	const ordered = [
		...writes.filter((write) => write.name !== savedName),
		...writes.filter((write) => write.name === savedName),
	];
	await mkdir(responsesDir, { recursive: true });
	for (const { content, name } of ordered) {
		await writeFile(join(responsesDir, name), content, 'utf8');
	}
	await writeFile(
		join(metadataDir, 'responses.md'),
		renderInterviewIndex(indexed, answered),
		'utf8',
	);
}
