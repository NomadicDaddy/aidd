import { useEffect, useRef, useState } from 'react';

import type { ProjectInterviewDetail, ProjectInterviewQuestion } from '../../../api/types.ts';

import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { ErrorState } from '../../../components/shared/ErrorState.tsx';
import { LoadingState } from '../../../components/shared/LoadingState.tsx';
import { MarkdownContent } from '../../../components/shared/MarkdownContent.tsx';
import { TabIntro } from '../../../components/shared/TabIntro.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { useSubmitProjectInterviewAnswer } from '../../../hooks/useProjects.ts';
import { percent } from '../../../lib/formatters.ts';
import { toneSolid } from '../../../lib/tones.ts';
import { proseMeasureClass } from '../../../lib/typography.ts';
import { InterviewFilters } from './InterviewFilters.tsx';
import { InterviewQuestionRow } from './InterviewQuestionRow.tsx';
import {
	interviewPriorityClass,
	interviewPriorityComposition,
	interviewPriorityRank,
	interviewPriorityTone,
	normalizedInterviewPriority,
} from './interviewUtils.ts';
import { clampPage } from './pagination-utils.ts';
import { Pagination } from './Pagination.tsx';
import { useInterviewFilters } from './useInterviewFilters.ts';

const INTERVIEW_PAGE_SIZE = 12;

export function InterviewTab({
	draftAnswers,
	interview,
	isError,
	isLoading,
	onDraftChange,
	onDraftSubmitted,
	projectId,
}: {
	draftAnswers: Readonly<Record<string, string>>;
	interview: ProjectInterviewDetail | undefined;
	isError: boolean;
	isLoading: boolean;
	onDraftChange: (questionId: string, value: string) => void;
	onDraftSubmitted: (questionId: string) => void;
	projectId: string | undefined;
}) {
	const [answeringId, setAnsweringId] = useState<null | string>(null);
	const [answeredPage, setAnsweredPage] = useState(0);
	const {
		priorityFilter,
		query,
		register: unansweredFilters,
		resetFilters,
		setPriorityFilter,
		setQuery,
		setUnansweredPage,
		unansweredPage,
	} = useInterviewFilters();
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
					onDraftSubmitted(question.id);
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
	const allQuestions = [...interview.answeredQuestions, ...interview.unanswered];
	const completionPercent = percent(interview.answered, interview.total);
	const progressSummary = (
		// `justify-end` is the far side of the card header's row. Once this wraps beneath the
		// identity the row is gone and the alignment is not: at 390 the 96px completion bar sat
		// alone on a fourth line 236px from the left, giving the header four lines and three
		// different left origins. Below `sm` the three parts read from the heading's rail.
		<div className="flex flex-wrap items-center justify-start gap-x-3 gap-y-1 text-xs text-muted-foreground sm:justify-end">
			<span>{interviewPriorityComposition(allQuestions)}</span>
			<span className="whitespace-nowrap tabular-nums">
				{interview.answered}/{interview.total} answered · {completionPercent}%
			</span>
			<div
				aria-label="Interview completion"
				aria-valuemax={interview.total}
				aria-valuemin={0}
				aria-valuenow={interview.answered}
				className="h-1.5 w-24 overflow-hidden rounded-full bg-control-border max-sm:hidden"
				role="progressbar">
				<div
					className={`h-full ${toneSolid.emerald}`}
					style={{ width: `${completionPercent}%` }}
				/>
			</div>
		</div>
	);
	const normalizedQuery = query.trim().toLowerCase();
	const priorityOptions = Array.from(
		new Set(interview.unanswered.map(normalizedInterviewPriority)),
	).sort(
		(left, right) =>
			interviewPriorityRank(left) - interviewPriorityRank(right) || left.localeCompare(right),
	);
	const filteredUnanswered = interview.unanswered
		.filter((question) => {
			if (
				priorityFilter !== 'all' &&
				normalizedInterviewPriority(question) !== priorityFilter
			) {
				return false;
			}
			return (
				normalizedQuery === '' || question.prompt.toLowerCase().includes(normalizedQuery)
			);
		})
		.toSorted((left, right) => {
			const priorityDifference =
				interviewPriorityRank(normalizedInterviewPriority(left)) -
				interviewPriorityRank(normalizedInterviewPriority(right));
			return priorityDifference || left.prompt.localeCompare(right.prompt);
		});
	const activeUnansweredPage = clampPage(
		unansweredPage,
		filteredUnanswered.length,
		INTERVIEW_PAGE_SIZE,
	);
	const unansweredSlice = filteredUnanswered.slice(
		activeUnansweredPage * INTERVIEW_PAGE_SIZE,
		(activeUnansweredPage + 1) * INTERVIEW_PAGE_SIZE,
	);
	const activeAnsweredPage = clampPage(
		answeredPage,
		interview.answeredQuestions.length,
		INTERVIEW_PAGE_SIZE,
	);
	const answeredSlice = interview.answeredQuestions.slice(
		activeAnsweredPage * INTERVIEW_PAGE_SIZE,
		(activeAnsweredPage + 1) * INTERVIEW_PAGE_SIZE,
	);
	return (
		<div className="@container space-y-4">
			<TabIntro
				description="The intake interview for this project — what has been answered and what is still outstanding."
				title="Interview"
			/>
			{interview.unanswered.length === 0 ? (
				<Card>
					<CardHeader
						className="mb-2"
						headingLevel={3}
						status={progressSummary}
						title="Unanswered questions"
					/>
					<p className="text-sm text-muted-foreground">
						All interview questions have responses.
					</p>
				</Card>
			) : (
				<section aria-label="Unanswered questions" className="space-y-3">
					<InterviewFilters
						filtered={filteredUnanswered.length}
						onPriorityChange={setPriorityFilter}
						onQueryChange={setQuery}
						onReset={resetFilters}
						priorities={priorityOptions}
						priority={priorityFilter}
						query={query}
						summary={progressSummary}
						total={interview.unanswered.length}
					/>
					{filteredUnanswered.length === 0 ? (
						<EmptyState filterReset="toolbar" filters={unansweredFilters}>
							No questions match the active filters.
						</EmptyState>
					) : (
						<Card className="p-0">
							<ul className="space-y-1.5 p-4">
								{unansweredSlice.map((question) => (
									<InterviewQuestionRow
										draft={draftAnswers[question.id] ?? ''}
										expanded={answeringId === question.id}
										key={question.id}
										onCancel={() => {
											setAnsweringId(null);
											setSubmitError(null);
										}}
										onDraftChange={(value) => onDraftChange(question.id, value)}
										onExpand={() => setAnsweringId(question.id)}
										onSubmit={() => submit(question)}
										pending={submitAnswer.isPending}
										question={question}
										submitError={
											answeringId === question.id ? submitError : null
										}
									/>
								))}
							</ul>
							<Pagination
								onChange={setUnansweredPage}
								page={activeUnansweredPage}
								pageSize={INTERVIEW_PAGE_SIZE}
								total={filteredUnanswered.length}
							/>
						</Card>
					)}
				</section>
			)}
			{interview.answeredQuestions.length > 0 ? (
				<Card>
					<CardHeader
						badge={<Badge tone="neutral">{interview.answeredQuestions.length}</Badge>}
						className="mb-2"
						headingLevel={3}
						title="Answered questions"
					/>
					<ul className="space-y-3">
						{answeredSlice.map((question) => (
							<li className="rounded-md border border-border p-3" key={question.id}>
								<div className="flex flex-wrap items-center gap-2">
									<Badge
										className={interviewPriorityClass(
											question.priority || 'NICE',
										)}
										tone={interviewPriorityTone(question.priority || 'NICE')}>
										{question.priority || 'NICE'}
									</Badge>
									<MarkdownContent
										className="leading-normal font-medium"
										markdown={question.prompt}
										measure="container"
									/>
								</div>
								<p
									className={`mt-2 text-sm whitespace-pre-wrap text-muted-foreground ${proseMeasureClass}`}>
									{question.response}
								</p>
							</li>
						))}
					</ul>
					<Pagination
						onChange={setAnsweredPage}
						page={activeAnsweredPage}
						pageSize={INTERVIEW_PAGE_SIZE}
						total={interview.answeredQuestions.length}
					/>
				</Card>
			) : null}
		</div>
	);
}
