import { useEffect, useRef, useState } from 'react';

import type { ProjectInterviewDetail } from '../../../api/types.ts';

import { ErrorState } from '../../../components/shared/ErrorState.tsx';
import { LoadingState } from '../../../components/shared/LoadingState.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { useSubmitProjectInterviewAnswer } from '../../../hooks/useProjects.ts';
import { toneText } from '../../../lib/tones.ts';

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
		<div className="space-y-4">
			<div className="grid gap-4 md:grid-cols-3">
				<Card>
					<div className="text-xs text-muted-foreground uppercase">Questions</div>
					<div className="mt-2 text-2xl font-semibold text-foreground">
						{interview.total}
					</div>
				</Card>
				<Card>
					<div className="text-xs text-muted-foreground uppercase">Completed</div>
					<div className={`mt-2 text-2xl font-semibold ${toneText.emerald}`}>
						{interview.answered}
					</div>
				</Card>
				<Card>
					<div className="text-xs text-muted-foreground uppercase">Unanswered</div>
					<div className={`mt-2 text-2xl font-semibold ${toneText.amber}`}>
						{remaining}
					</div>
				</Card>
			</div>
			<Card>
				<CardHeader className="mb-2" title="Unanswered questions" />
				{interview.unanswered.length === 0 ? (
					<p className="text-sm text-muted-foreground">
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
									className="rounded-md border border-border p-3"
									key={question.id}>
									<div className="mb-1 flex items-center gap-2">
										<Badge tone="neutral">{question.priority || 'NICE'}</Badge>
										{!isExpanded && trimmedDraft.length > 0 ? (
											<Badge tone="amber">Draft</Badge>
										) : null}
									</div>
									<p className="text-sm text-foreground">{question.prompt}</p>
									<div className="mt-2">
										{isExpanded ? (
											<div className="space-y-2">
												<textarea
													aria-label={`Answer for question: ${question.prompt}`}
													className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
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
													className={`min-h-0 text-xs ${toneText.red}`}
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
																				: 'Failed to submit answer',
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
																},
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
					<CardHeader className="mb-2" title="Answered questions" />
					<ul className="space-y-3">
						{interview.answeredQuestions.map((question) => (
							<li className="rounded-md border border-border p-3" key={question.id}>
								<div className="mb-1 flex items-center gap-2">
									<Badge tone="emerald">{question.priority || 'NICE'}</Badge>
								</div>
								<p className="text-sm font-medium text-foreground">
									{question.prompt}
								</p>
								<p className="mt-2 text-sm whitespace-pre-wrap text-muted-foreground">
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
