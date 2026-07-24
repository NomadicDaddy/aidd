import { useEffect, useRef, useState } from 'react';

import type { ProjectInterviewDetail } from '../../../api/types.ts';

import { ErrorState } from '../../../components/shared/ErrorState.tsx';
import { LoadingState } from '../../../components/shared/LoadingState.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { useSubmitProjectInterviewAnswer } from '../../../hooks/useProjects.ts';

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

	if (isLoading) {
		return <LoadingState message="Loading interview…" />;
	}
	if (isError || !interview) {
		return <ErrorState message="Could not load interview details." />;
	}
	if (!interview.hasQuestionsFile) {
		return (
			<Card className="py-10 text-center text-sm text-neutral-500">
				No <code>.aidd/questions.md</code> found for this project.
			</Card>
		);
	}
	if (interview.total === 0) {
		return (
			<Card className="py-10 text-center text-sm text-neutral-500">
				<p>The interview file is present but contains no parsed questions.</p>
				<p className="mt-1 text-xs">
					Questions must use the <code>- **[PRIORITY]** prompt</code> format.
				</p>
			</Card>
		);
	}
	const remaining = interview.total - interview.answered;
	return (
		<div className="space-y-4">
			<div className="grid gap-4 md:grid-cols-3">
				<Card>
					<div className="text-xs text-neutral-500 uppercase">Questions</div>
					<div className="text-foreground mt-2 text-2xl font-semibold">
						{interview.total}
					</div>
				</Card>
				<Card>
					<div className="text-xs text-neutral-500 uppercase">Completed</div>
					<div className="mt-2 text-2xl font-semibold text-emerald-700 dark:text-emerald-400">
						{interview.answered}
					</div>
				</Card>
				<Card>
					<div className="text-xs text-neutral-500 uppercase">Unanswered</div>
					<div className="mt-2 text-2xl font-semibold text-amber-700 dark:text-amber-400">
						{remaining}
					</div>
				</Card>
			</div>
			<Card>
				<h2 className="text-foreground mb-2 text-sm font-semibold">Unanswered questions</h2>
				{interview.unanswered.length === 0 ? (
					<p className="text-sm text-neutral-500">
						All interview questions have responses.
					</p>
				) : (
					<ul className="space-y-2">
						{interview.unanswered.map((question) => {
							const isExpanded = answeringId === question.id;
							const draft = draftAnswers[question.id] ?? '';
							const trimmedDraft = draft.trim();
							const canSubmit = !submitAnswer.isPending && trimmedDraft.length > 0;
							return (
								<li
									className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
									key={question.id}>
									<div className="mb-1 flex items-center gap-2">
										<Badge tone="neutral">{question.priority || 'NICE'}</Badge>
										{!isExpanded && trimmedDraft.length > 0 ? (
											<Badge tone="amber">Draft</Badge>
										) : null}
									</div>
									<p className="text-sm text-neutral-800 dark:text-neutral-200">
										{question.prompt}
									</p>
									<div className="mt-2">
										{isExpanded ? (
											<div className="space-y-2">
												<textarea
													aria-label={`Answer for question: ${question.prompt}`}
													className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500"
													disabled={submitAnswer.isPending}
													onChange={(event) =>
														setDraftAnswers((prev) => ({
															...prev,
															[question.id]: event.target.value,
														}))
													}
													placeholder="Type your answer…"
													rows={3}
													value={draft}
												/>
												<p
													aria-live="assertive"
													className="min-h-0 text-xs text-red-700 dark:text-red-400"
													role="alert">
													{submitError && answeringId === question.id
														? submitError
														: ''}
												</p>
												<div className="flex gap-2">
													<Button
														aria-label={`Submit answer for question: ${question.prompt}`}
														disabled={!canSubmit}
														onClick={() => {
															setSubmitError(null);
															submitAnswer.mutate(
																{
																	answer: trimmedDraft,
																	questionId: question.id,
																},
																{
																	onError: (error) => {
																		if (
																			answeringIdRef.current !==
																			question.id
																		) {
																			return;
																		}
																		setSubmitError(
																			error instanceof Error
																				? error.message
																				: 'Failed to submit answer'
																		);
																	},
																	onSuccess: () => {
																		setDraftAnswers((prev) => {
																			if (
																				!(
																					question.id in
																					prev
																				)
																			) {
																				return prev;
																			}
																			const next = {
																				...prev,
																			};
																			delete next[
																				question.id
																			];
																			return next;
																		});
																		if (
																			answeringIdRef.current ===
																			question.id
																		) {
																			setAnsweringId(null);
																			setSubmitError(null);
																		}
																	},
																}
															);
														}}
														variant="primary">
														Submit
													</Button>
													<Button
														aria-label={`Cancel answer for question: ${question.prompt}`}
														disabled={submitAnswer.isPending}
														onClick={() => {
															setAnsweringId(null);
															setSubmitError(null);
														}}
														variant="secondary">
														Cancel
													</Button>
												</div>
											</div>
										) : (
											<Button
												aria-label={
													trimmedDraft.length > 0
														? `Resume draft for question: ${question.prompt}`
														: `Answer question: ${question.prompt}`
												}
												disabled={submitAnswer.isPending}
												onClick={() => setAnsweringId(question.id)}
												variant="secondary">
												{trimmedDraft.length > 0
													? 'Resume draft'
													: 'Answer'}
											</Button>
										)}
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</Card>
			{interview.answeredQuestions.length > 0 ? (
				<Card>
					<h2 className="text-foreground mb-2 text-sm font-semibold">
						Answered questions
					</h2>
					<ul className="space-y-3">
						{interview.answeredQuestions.map((question) => (
							<li
								className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
								key={question.id}>
								<div className="mb-1 flex items-center gap-2">
									<Badge tone="emerald">{question.priority || 'NICE'}</Badge>
								</div>
								<p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
									{question.prompt}
								</p>
								<p className="mt-2 text-sm whitespace-pre-wrap text-neutral-600 dark:text-neutral-400">
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
