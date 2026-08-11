/* eslint-disable react-refresh/only-export-components */
import { default as CircleDashed } from 'lucide-react/dist/esm/icons/circle-dashed';
import { default as ExternalLink } from 'lucide-react/dist/esm/icons/external-link';
import { Link } from 'react-router';

import type {
	PipelineSessionReport,
	PipelineStepResultRecord,
	RecipeStepDefinition,
} from '../../api/types.ts';

import { ExecutionIdentityBadges } from '../../components/shared/ExecutionIdentityBadges.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { buttonClassName } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { formatActiveDuration, formatDate } from '../../lib/formatters.ts';
import { stepTypeLabel } from '../../lib/stepTypeLabel.ts';
import { toneText } from '../../lib/tones.ts';
import { proseMeasureClass } from '../../lib/typography.ts';
import { sessionStatusTone, stepStatusLabel } from '../runs/pipelineSessionStatus.ts';
import { pipelineStepLiveConsoleHref } from './pipelineSessionLinks.ts';
import { StepRunConsole } from './StepRunConsole.tsx';
import { StepRunDetail } from './StepRunDetail.tsx';

/**
 * Build a unified ordered list of every step in the session — both executed
 * (persisted as PipelineStepResultRecord) and pending (only known from the
 * recipe definition). Top-level recipe steps (depth 0, phase 'step') are the
 * anchors: each one is shown with its sequence number. Non-anchor rows
 * (hooks, nested recipe-ref children, auto-fix retries) render inline beneath
 * their parent anchor so the vertical list reads as the full plan.
 *
 * If the recipe definition is unavailable (e.g. deleted), the list falls back
 * to showing only the executed rows, preserving the original behavior.
 */
export type StepRow =
	| { kind: 'executed'; result: PipelineStepResultRecord }
	| { kind: 'pending'; sequenceNumber: number; step: RecipeStepDefinition };

export function buildStepRows(report: PipelineSessionReport): StepRow[] {
	const recipeStepCount = report.recipeSteps.length;
	// When the recipe plan is unavailable, fall back to the original executed-only view.
	if (recipeStepCount === 0) {
		return report.stepResults.map((result) => ({ kind: 'executed' as const, result }));
	}

	const anchors = report.stepResults.filter((s) => s.depth === 0 && s.phase === 'step');
	const nonAnchors = report.stepResults.filter((s) => !(s.depth === 0 && s.phase === 'step'));

	const rows: StepRow[] = [];
	let nonAnchorIdx = 0;
	for (let seq = 1; seq <= recipeStepCount; seq += 1) {
		const anchor = anchors.find((a) => a.sequenceNumber === seq);
		if (anchor) {
			// Flush non-anchor executed rows (hooks/children) that precede this anchor.
			while (
				nonAnchorIdx < nonAnchors.length &&
				nonAnchors[nonAnchorIdx]!.displayOrder < anchor.displayOrder
			) {
				rows.push({ kind: 'executed', result: nonAnchors[nonAnchorIdx]! });
				nonAnchorIdx += 1;
			}
			rows.push({ kind: 'executed', result: anchor });
		} else {
			rows.push({
				kind: 'pending',
				sequenceNumber: seq,
				step: report.recipeSteps[seq - 1]!,
			});
		}
	}
	// Flush any remaining non-anchor rows (e.g. a hook after the final step).
	while (nonAnchorIdx < nonAnchors.length) {
		rows.push({ kind: 'executed', result: nonAnchors[nonAnchorIdx]! });
		nonAnchorIdx += 1;
	}
	return rows;
}

/**
 * One executed step on the session report.
 *
 * `sessionErrorMessage` is passed in so the card can tell whether its own `errorMessage` is news.
 * A failing session usually adopts its failing step's message verbatim, and the report then printed
 * that one 280-character sentence three times inside 600 vertical pixels — as the Status metric's
 * detail, as this red paragraph, and again as the run's RESULT record. The Status metric is the
 * answer the page is opened for and keeps it; this paragraph repeats it and is the copy that goes.
 */
export function ExecutedStepRow({
	now,
	sessionErrorMessage,
	step,
}: {
	now: number;
	sessionErrorMessage: null | string;
	step: PipelineStepResultRecord;
}) {
	// Only when it is the *same* sentence. A step that failed differently from the session — the
	// common case in `completed_with_failures`, where the session names the first failure and a
	// later step names its own — still says so here.
	const errorIsRestated = step.errorMessage !== null && step.errorMessage === sessionErrorMessage;
	return (
		// The depth indent lives on a wrapper because Card owns its own box; keeping it outside also
		// means the nested surface keeps the house card radius rather than the badge-sized rounded-md.
		<div style={{ marginLeft: `${Math.min(step.depth, 4) * 16}px` }}>
			<Card variant="sunken">
				{/* The house header, at the subsection rank. Hand-rolled, this row put the step name
				    in `text-base font-semibold text-foreground` — character for character the rank
				    the "Steps" card title above it uses — so a card and the twelve cards inside it
				    all announced themselves at the same size, and `justify-between` pushed "Open in
				    Live Console" to the card's far edge with 1353px of nothing beside the name at
				    2250. `max-w-[61rem]` is what closes that gutter: the action stays with the title
				    column instead of tracking the card's width. */}
				<CardHeader
					action={
						step.runId ? (
							<Link
								className={buttonClassName()}
								to={pipelineStepLiveConsoleHref(step.runId)}>
								<ExternalLink className="h-4 w-4" />
								Open in Live Console
							</Link>
						) : null
					}
					badge={
						<>
							{/* Status leads the badge rail: `phase` reads 'step' on every top-level
							    row, so it only earns a badge where it distinguishes a hook, a nested
							    recipe-ref child or an auto-fix retry. */}
							<Badge tone={sessionStatusTone(step.status)}>
								{stepStatusLabel(step.status)}
							</Badge>
							{step.phase !== 'step' && <Badge>{step.phase}</Badge>}
							<Badge tone="neutral">{stepTypeLabel(step.stepType)}</Badge>
							{step.executionIdentity ? (
								<ExecutionIdentityBadges {...step.executionIdentity} />
							) : null}
						</>
					}
					className="mb-0 max-w-[61rem]"
					description={
						// `tabular-nums` survives the move because it is on a span of its own; the
						// description slot sets its own colour and size and would otherwise drop it.
						<span className="tabular-nums">
							{formatDate(step.startedAt)} ·{' '}
							{formatActiveDuration(step.durationMs, step.startedAt, now)}
						</span>
					}
					headingLevel={3}
					level="subsection"
					title={step.stepName}
				/>
				{step.errorMessage && !errorIsRestated && (
					<p className={`mt-3 text-sm ${toneText.red} ${proseMeasureClass}`}>
						{step.errorMessage}
					</p>
				)}
				{/* What the step did, then the transcript behind a disclosure — the order the Live
				    Console uses. It was the other way round: a raw NDJSON slab as the card's default
				    content, and nothing structured at all. */}
				{step.runId ? (
					<StepRunDetail
						runId={step.runId}
						sessionErrorMessage={sessionErrorMessage}
						step={step}
					/>
				) : null}
				<StepRunConsole
					outputSummary={step.outputSummary}
					runId={step.runId}
					stepStatus={step.status}
				/>
			</Card>
		</div>
	);
}

export function PendingStepRow({
	sequenceNumber,
	step,
	totalSteps,
}: {
	sequenceNumber: number;
	step: RecipeStepDefinition;
	totalSteps: number;
}) {
	return (
		<div className="rounded-xl border border-dashed border-border bg-muted/40 p-4">
			{/* Same header as the executed row above, at the same rank, so a pending step and a
			    finished one read as the same kind of thing in the same list. The dashed border, the
			    Pending badge and the description carry "not started"; the title no longer has to,
			    which is what let it drop the one-off muted colour it was the only heading to use. */}
			<CardHeader
				badge={
					<>
						<Badge tone="neutral">
							<CircleDashed className="h-3 w-3" />
							Pending
						</Badge>
						<Badge tone="neutral">{stepTypeLabel(step.stepType)}</Badge>
						<span className="text-xs font-medium text-muted-foreground">
							Step {sequenceNumber} of {totalSteps}
						</span>
					</>
				}
				className="mb-0 max-w-[61rem]"
				description="Not started yet"
				headingLevel={3}
				level="subsection"
				title={step.name}
			/>
		</div>
	);
}
