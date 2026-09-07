import type {
	ModeContext,
	ModeHandler,
	ModeResult,
	ModeSummary,
	SelectedWork,
} from 'aidd-shared/modes/types';
import type { AgentRunResult } from 'aidd-shared/orchestrator/result';
import type { PromptPlan, RunPlan } from 'aidd-shared/plan/types';

import { metadataPath } from 'aidd-shared/metadata/paths';
import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';

import {
	buildGenerateQuestionsDirective,
	buildGenerateQuestionsRetryDirective,
} from './interview-generate-questions.ts';
import {
	exists,
	firstUnansweredQuestion,
	type InterviewQuestion,
	interviewQuestionsPath,
	interviewResponsePath,
	readInterviewQuestions,
	responseFromStructuredResult,
	stringValue,
	writeInterviewIndex,
	writeInterviewResponse,
} from './interview-questions.ts';

interface InterviewWorkData {
	question?: InterviewQuestion;
	questionsFile: string;
	totalQuestions: number;
}

interface GenerateQuestionsWorkData {
	generateQuestions: true;
	questionsFile: string;
}

type InterviewData = GenerateQuestionsWorkData | InterviewWorkData;

function isGenerateQuestionsData(
	data: InterviewData | undefined,
): data is GenerateQuestionsWorkData {
	return !!data && 'generateQuestions' in data && data.generateQuestions === true;
}

// Question generation retries the identical work item when the agent exits cleanly without
// creating the file, so an agent that misunderstands the deliverable would otherwise loop to
// max iterations (observed: 30 identical iterations, ~6.5M input tokens). Retries escalate
// the directive once, then the mode ends the run as flailing.
const maxGenerateQuestionAttempts = 3;

export function createInterviewMode(plan: RunPlan): ModeHandler {
	let failedGenerateAttempts = 0;
	return {
		async buildPromptPlan(context: ModeContext, work: SelectedWork): Promise<PromptPlan> {
			const data = work.data as InterviewData | undefined;
			if (isGenerateQuestionsData(data)) {
				const relativeQuestionsFile = relative(
					context.projectDir,
					data.questionsFile,
				).replaceAll('\\', '/');
				return {
					...plan.prompt,
					customDirective:
						failedGenerateAttempts === 0
							? buildGenerateQuestionsDirective(relativeQuestionsFile)
							: buildGenerateQuestionsRetryDirective(
									data.questionsFile,
									relativeQuestionsFile,
									failedGenerateAttempts,
								),
					variables: {
						...plan.prompt.variables,
						metadataDir: metadataPath(context.projectDir),
					},
				};
			}
			if (!data?.question) return plan.prompt;
			return {
				...plan.prompt,
				variables: {
					...plan.prompt.variables,
					interviewFile: data.questionsFile,
					interviewQuestionNumber: data.question.number,
					interviewQuestionText: data.question.text,
					interviewTotalQuestions: data.totalQuestions,
					metadataDir: metadataPath(context.projectDir),
				},
			};
		},
		async isComplete(_context: ModeContext, result: ModeResult): Promise<boolean> {
			return result.complete;
		},
		name: 'interview',
		async processResult(context: ModeContext, result: AgentRunResult): Promise<ModeResult> {
			const data = result.selectedWork?.data as InterviewData | undefined;
			if (isGenerateQuestionsData(data)) {
				// Parse rather than merely stat: an empty or question-less file would count as
				// success here only to make the next run's selectWork throw on it.
				const questions = await readInterviewQuestions(data.questionsFile).catch(() => []);
				const generated = questions.length > 0;
				if (result.exitCode === 0 && !generated) failedGenerateAttempts++;
				if (!generated && failedGenerateAttempts >= maxGenerateQuestionAttempts) {
					return {
						artifacts: {
							questionsFile: data.questionsFile,
							questionsGenerated: false,
						},
						complete: false,
						fatal: {
							exitCode: orchestratorExitCodes.flailing,
							stopReason: 'flailing',
						},
						summary: `interview questions file was not created after ${failedGenerateAttempts} attempt(s); giving up (expected at ${data.questionsFile})`,
					};
				}
				return {
					artifacts: { questionsFile: data.questionsFile, questionsGenerated: generated },
					complete: result.exitCode === 0 && generated,
					summary: generated
						? 'interview questions generated'
						: 'interview questions generation attempted but no parseable questions file found',
				};
			}
			if (!data?.question) {
				return {
					artifacts: { selectedWork: result.selectedWork },
					complete: true,
					summary: 'interview has no unanswered questions',
				};
			}
			const responsePath = interviewResponsePath(context.projectDir, data.question.number);
			const responseMarkdown =
				stringValue(await readFile(responsePath, 'utf8').catch(() => undefined)) ??
				responseFromStructuredResult(result, data.question);
			await writeInterviewResponse(responsePath, responseMarkdown);
			const questions = await readInterviewQuestions(data.questionsFile);
			await writeInterviewIndex(context.projectDir, questions);
			const nextQuestion = await firstUnansweredQuestion(context.projectDir, questions);
			return {
				artifacts: {
					questionNumber: data.question.number,
					responsePath,
					totalQuestions: data.totalQuestions,
				},
				complete: result.exitCode === 0 && nextQuestion === undefined,
				summary: `interview answered question ${data.question.number}/${data.totalQuestions}`,
			};
		},
		async selectWork(context: ModeContext): Promise<SelectedWork> {
			const questionsFile = interviewQuestionsPath(context.projectDir, plan);
			if (!(await exists(questionsFile))) {
				return {
					data: {
						generateQuestions: true,
						questionsFile,
					} satisfies GenerateQuestionsWorkData,
					description: 'generate interview questions from codebase analysis',
					id: 'generate-questions',
					kind: 'generic',
				};
			}
			const questions = await readInterviewQuestions(questionsFile);
			const question = await firstUnansweredQuestion(context.projectDir, questions);
			if (!question) {
				return {
					data: { questionsFile, totalQuestions: questions.length },
					description: 'all interview questions answered',
					id: 'no-work',
					kind: 'none',
				};
			}
			return {
				data: {
					question,
					questionsFile,
					totalQuestions: questions.length,
				} satisfies InterviewWorkData,
				description: question.text,
				id: `question-${question.number}`,
				kind: 'generic',
			};
		},
		async summarize(_context: ModeContext, result: ModeResult): Promise<ModeSummary> {
			return { text: result.summary };
		},
	};
}
