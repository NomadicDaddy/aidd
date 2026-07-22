import type { AgentRunResult } from 'aidd-shared/orchestrator/result';
import type { RunPlan } from 'aidd-shared/plan/types';

import { METADATA_DIR, metadataPath } from 'aidd-shared/metadata/paths';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

// Interview question parsing, response persistence, and index rendering. Split out of interview.ts
// so the ModeHandler wiring and these pure file/format helpers stay in separate, headroom-having
// modules under the 300-line cap.

export interface InterviewQuestion {
	number: number;
	text: string;
}

export function interviewQuestionsPath(projectDir: string, plan: RunPlan): string {
	const configured = plan.prompt.variables.interviewFile;
	return resolve(
		projectDir,
		typeof configured === 'string' ? configured : `${METADATA_DIR}/questions.md`
	);
}

export async function readInterviewQuestions(path: string): Promise<InterviewQuestion[]> {
	const content = await readFile(path, 'utf8');
	const headingQuestions = questionsFromHeadings(content);
	const questions = headingQuestions.length > 0 ? headingQuestions : questionsFromLines(content);
	if (questions.length === 0) {
		throw new Error(`Interview questions file has no parsed questions: ${path}`);
	}
	return questions.map((text, index) => ({ number: index + 1, text }));
}

function questionsFromHeadings(content: string): string[] {
	const lines = content.split(/\r?\n/);
	const questions: string[] = [];
	let current: string[] = [];
	for (const line of lines) {
		if (line.startsWith('## ')) {
			if (current.length > 0) questions.push(current.join('\n').trim());
			current = [line];
		} else if (current.length > 0) {
			current.push(line);
		}
	}
	if (current.length > 0) questions.push(current.join('\n').trim());
	return questions.filter((question) => question && isQuestionSection(question));
}

function isQuestionSection(section: string): boolean {
	const title = questionTitle(section).toLowerCase();
	if (title === 'legend' || title === 'summary') return false;
	return /\?\s*(?:\r?\n|$)/.test(section);
}

function questionsFromLines(content: string): string[] {
	return content
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => /\?\s*$/.test(line));
}

export async function firstUnansweredQuestion(
	projectDir: string,
	questions: InterviewQuestion[]
): Promise<InterviewQuestion | undefined> {
	for (const question of questions) {
		if (!(await exists(interviewResponsePath(projectDir, question.number)))) return question;
	}
	return undefined;
}

export function responseFromStructuredResult(
	result: AgentRunResult,
	question: InterviewQuestion
): string {
	const responseMarkdown =
		stringValue(result.structuredResult?.responseMarkdown) ??
		stringValue(result.structuredResult?.interviewResponse);
	if (responseMarkdown) return responseMarkdown;
	const assistantText = result.events
		.filter((event) => event.type === 'assistant_text')
		.map((event) => event.chunk)
		.join('');
	return [
		`# Question ${question.number}: ${questionTitle(question.text)}`,
		'',
		'## Question',
		'',
		question.text,
		'',
		'## Response',
		'',
		assistantText.trim() || 'No structured interview response was provided.',
		'',
	].join('\n');
}

export async function writeInterviewResponse(responsePath: string, content: string): Promise<void> {
	await mkdir(dirname(responsePath), { recursive: true });
	await writeFile(responsePath, content.endsWith('\n') ? content : `${content}\n`);
}

export async function writeInterviewIndex(
	projectDir: string,
	questions: InterviewQuestion[]
): Promise<void> {
	const metadataDir = metadataPath(projectDir);
	const responsesDir = join(metadataDir, 'responses');
	const rows: string[] = [];
	let doneCount = 0;
	for (const question of questions) {
		const responseName = `response${question.number}.md`;
		const done = await exists(join(responsesDir, responseName));
		if (done) doneCount++;
		rows.push(
			`| ${question.number} | ${truncateQuestion(question.text)} | ${done ? 'Done' : 'Pending'} | ${
				done ? `[${responseName}](responses/${responseName})` : '-'
			} |`
		);
	}
	const index = [
		'# Interview Responses',
		'',
		'| # | Question | Status | Response |',
		'|---|----------|--------|----------|',
		...rows,
		'',
		`**Progress:** ${doneCount} / ${questions.length} questions answered`,
		'',
	].join('\n');
	await mkdir(metadataDir, { recursive: true });
	await writeFile(join(metadataDir, 'responses.md'), index);
}

export async function exists(path: string): Promise<boolean> {
	try {
		await readFile(path);
		return true;
	} catch {
		return false;
	}
}

export function interviewResponsePath(projectDir: string, questionNumber: number): string {
	return metadataPath(projectDir, 'responses', `response${questionNumber}.md`);
}

function questionTitle(question: string): string {
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

export function stringValue(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
