import type { ProjectInterviewQuestion } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { textareaClass } from '../../../lib/formStyles.ts';
import { toneText } from '../../../lib/tones.ts';
import { proseMeasureClass } from '../../../lib/typography.ts';
import { interviewPriorityTone } from './interviewUtils.ts';

interface InterviewQuestionRowProps {
	draft: string;
	expanded: boolean;
	onCancel: () => void;
	onDraftChange: (value: string) => void;
	onExpand: () => void;
	onSubmit: () => void;
	pending: boolean;
	question: ProjectInterviewQuestion;
	submitError: null | string;
}

/**
 * One unanswered question, collapsed to a single line until it is being answered.
 *
 * Each question used to occupy a ~126px block — a chip row, the prompt, then a full-size "Answer"
 * button on its own line — so only four of forty fit on a 900px screen and the repeated identical
 * button set the rhythm of the list. The row itself is now the disclosure control, which is why the
 * button can go: the affordance is the same one MaturityArtifactRow uses for the artifact viewer.
 */
export function InterviewQuestionRow({
	draft,
	expanded,
	onCancel,
	onDraftChange,
	onExpand,
	onSubmit,
	pending,
	question,
	submitError,
}: InterviewQuestionRowProps) {
	const trimmedDraft = draft.trim();
	const priority = question.priority || 'NICE';
	const chips = (
		<>
			<Badge tone={interviewPriorityTone(priority)}>{priority}</Badge>
			{!expanded && trimmedDraft.length > 0 ? <Badge tone="amber">Draft</Badge> : null}
		</>
	);
	if (!expanded) {
		return (
			<li className="rounded-md border border-border">
				<button
					aria-expanded={false}
					aria-label={
						trimmedDraft.length > 0
							? `Resume draft for question: ${question.prompt}`
							: `Answer question: ${question.prompt}`
					}
					className="flex w-full items-start gap-2 rounded-md p-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none disabled:opacity-60 max-sm:min-h-11"
					disabled={pending}
					onClick={onExpand}
					type="button">
					{/* A fixed leading column, because the priority badge is the one thing every
					    row in this list has and the prompt is the thing being read down it. Sharing
					    a single wrapping flex line, the prompt's left edge moved with the length of
					    the badge's word — four different x-origins in the first eight rows at 1440 —
					    and a prompt with no room left dropped below the badge entirely, so one list
					    held 44px, 72px and 92px rows. 6rem clears `CRITICAL`, the longest of the
					    four; the occasional `Draft` chip wraps under it rather than pushing forty
					    prompts sideways for the one row that has a draft. */}
					<span className="flex w-24 shrink-0 flex-wrap items-center gap-1.5">
						{chips}
					</span>
					<span className="min-w-0 flex-1 text-sm text-foreground">
						{question.prompt}
					</span>
				</button>
			</li>
		);
	}
	return (
		<li className="rounded-md border border-border p-2.5">
			{/* The measure applies to the expanded row only. Collapsed rows are a dense single-line
			    list — the density this component exists to deliver — and capping them would wrap a
			    long prompt over three lines forty times over. Expanded, the prompt is the heading
			    the answer is written under, and only one row is ever expanded. */}
			<div className="flex flex-wrap items-center gap-2">
				{chips}
				<span className={`text-sm text-foreground ${proseMeasureClass}`}>
					{question.prompt}
				</span>
			</div>
			<div className="mt-2 space-y-2">
				<textarea
					aria-label={`Answer for question: ${question.prompt}`}
					className={textareaClass}
					disabled={pending}
					onChange={(event) => onDraftChange(event.target.value)}
					placeholder="Type your answer…"
					rows={3}
					value={draft}
				/>
				<p aria-live="assertive" className={`min-h-0 text-xs ${toneText.red}`} role="alert">
					{submitError ?? ''}
				</p>
				<div className="flex gap-2">
					<Button
						aria-label={`Submit answer for question: ${question.prompt}`}
						disabled={pending || trimmedDraft.length === 0}
						onClick={onSubmit}
						variant="primary">
						Submit
					</Button>
					<Button
						aria-label={`Cancel answer for question: ${question.prompt}`}
						disabled={pending}
						onClick={onCancel}
						variant="secondary">
						Cancel
					</Button>
				</div>
			</div>
		</li>
	);
}
