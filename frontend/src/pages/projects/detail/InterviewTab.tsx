import { useEffect, useRef, useState } from 'react';

import type { ProjectInterviewDetail, ProjectInterviewQuestion } from '../../../api/types.ts';

import { ErrorState } from '../../../components/shared/ErrorState.tsx';
import { LoadingState } from '../../../components/shared/LoadingState.tsx';
import { Metric } from '../../../components/shared/Metric.tsx';
import { TabIntro } from '../../../components/shared/TabIntro.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { useSubmitProjectInterviewAnswer } from '../../../hooks/useProjects.ts';
import { proseMeasureClass } from '../../../lib/typography.ts';
import { InterviewQuestionRow } from './InterviewQuestionRow.tsx';
import { interviewPriorityTone } from './interviewUtils.ts';

export function InterviewTab({
	interview,
	isError,
	isLoading,
	projectId,
}: {
	interview: ProjectInterviewDetail | undefined;
	isError: boolean;
	isLoading: boolean;
	projectId: string | undefined;
}) {
	const [answeringId, setAnsweringId] = useState<null | string>(null);
	const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({});
	const [submitError, setSubmitError] = useState<null | string>(null);
	const submitAnswer = useSubmitProjectInterviewAnswer(projectId);
	const answeringIdRef = useRef<null | string>(null);
	useEffect(() => {
		answeringIdRef.current = answeringId;
	}, [answeringId]);

	function submit(question: ProjectInterviewQuestion): void {
		const answer = (draftAnswers[question.id] ?? '').trim();
		if (answer.length === 0) return;
		setSubmitError(null);
		submitAnswer.mutate(
			{ answer, questionId: question.id },
			{
				onError: (error) => {
					if (answeringIdRef.current !== question.id) return;
					setSubmitError(
						error instanceof Error ? error.message : 'Failed to submit answer',
					);
				},
				onSuccess: () => {
					setDraftAnswers((prev) => {
						if (!(question.id in prev)) return prev;
						const next = { ...prev };
						delete next[question.id];
						return next;
					});
					if (answeringIdRef.current === question.id) {
						setAnsweringId(null);
						setSubmitError(null);
					}
				},
			},
		);
	}

	if (isLoading) {
		return <LoadingState message="Loading interview…" />;
	}
	if (isError || !interview) {
		return <ErrorState message="Could not load interview details." />;
	}
	if (!interview.hasQuestionsFile) {
		return (
			<Card className="py-10 text-center text-sm text-muted-foreground">
				No <code>.aidd/questions.md</code> found for this project.
			</Card>
		);
	}
	if (interview.total === 0) {
		return (
			<Card className="py-10 text-center text-sm text-muted-foreground">
				<p>The interview file is present but contains no parsed questions.</p>
				<p className="mt-1 text-xs">
					Questions must use the <code>- **[PRIORITY]** prompt</code> format.
				</p>
			</Card>
		);
	}
	const remaining = interview.total - interview.answered;
	return (
		<div className="@container space-y-4">
			<TabIntro
				description="The intake interview for this project — what has been answered and what is still outstanding."
				title="Interview"
			/>
			{/* The shared metric tile rather than three more hand-rolled ones: these were the only
			    place in the app that re-declared the tone colours locally, and they did it with values
			    `toneText` does not use. */}
			{/* Each tile carries its `detail` line, the way the Artifacts row one tab away does.
			    Without it the two rows of the same shared tile rendered at visibly different heights,
			    and the shorter Interview strip read as a different, lesser component. */}
			<div className="grid gap-4 @min-[22rem]:grid-cols-3">
				<Metric
					compactOnMobile
					detail="In this interview"
					label="Questions"
					value={interview.total}
				/>
				<Metric
					compactOnMobile
					detail="Answered"
					label="Completed"
					tone="emerald"
					value={interview.answered}
				/>
				<Metric
					compactOnMobile
					detail="Outstanding"
					label="Unanswered"
					tone="amber"
					value={remaining}
				/>
			</div>
			<Card>
				<CardHeader className="mb-2" title="Unanswered questions" />
				{interview.unanswered.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						All interview questions have responses.
					</p>
				) : (
					<ul className="space-y-1.5">
						{interview.unanswered.map((question) => (
							<InterviewQuestionRow
								draft={draftAnswers[question.id] ?? ''}
								expanded={answeringId === question.id}
								key={question.id}
								onCancel={() => {
									setAnsweringId(null);
									setSubmitError(null);
								}}
								onDraftChange={(value) =>
									setDraftAnswers((prev) => ({ ...prev, [question.id]: value }))
								}
								onExpand={() => setAnsweringId(question.id)}
								onSubmit={() => submit(question)}
								pending={submitAnswer.isPending}
								question={question}
								submitError={answeringId === question.id ? submitError : null}
							/>
						))}
					</ul>
				)}
			</Card>
			{interview.answeredQuestions.length > 0 ? (
				<Card>
					<CardHeader className="mb-2" title="Answered questions" />
					<ul className="space-y-3">
						{interview.answeredQuestions.map((question) => (
							<li className="rounded-md border border-border p-3" key={question.id}>
								<div className="flex flex-wrap items-center gap-2">
									<Badge
										tone={interviewPriorityTone(question.priority || 'NICE')}>
										{question.priority || 'NICE'}
									</Badge>
									{/* Answered questions are read, not scanned — unlike the collapsed
									    rows above, which are a dense index and stay uncapped on
									    purpose. Both halves take the measure, so the answer wraps
									    under the question rather than at a different width. */}
									<span
										className={`text-sm font-medium text-foreground ${proseMeasureClass}`}>
										{question.prompt}
									</span>
								</div>
								<p
									className={`mt-2 text-sm whitespace-pre-wrap text-muted-foreground ${proseMeasureClass}`}>
									{question.response}
								</p>
							</li>
						))}
					</ul>
				</Card>
			) : null}
		</div>
	);
}
