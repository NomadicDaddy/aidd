import { hasParkedWorkMarker } from 'aidd-shared/runs/outcome';
import { default as CircleDashed } from 'lucide-react/dist/esm/icons/circle-dashed';
import { default as CornerDownRight } from 'lucide-react/dist/esm/icons/corner-down-right';
import { default as ExternalLink } from 'lucide-react/dist/esm/icons/external-link';
import { Link } from 'react-router';

import type { PipelineStepResultRecord, RecipeStepDefinition, RunRecord } from '../../api/types.ts';

import { ExecutionIdentityBadges } from '../../components/shared/ExecutionIdentityBadges.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { buttonClassName } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { Tooltip } from '../../components/ui/tooltip.tsx';
import { useRunRecord } from '../../hooks/useRuns.ts';
import { cn } from '../../lib/cn.ts';
import { formatDate } from '../../lib/formatters.ts';
import { stepTypeLabel } from '../../lib/stepTypeLabel.ts';
import { toneText } from '../../lib/tones.ts';
import { proseMeasureClass } from '../../lib/typography.ts';
import { sessionStatusTone, stepStatusLabel } from '../runs/pipelineSessionStatus.ts';
import { pipelineStepLiveConsoleHref } from './pipelineSessionLinks.ts';
import { pipelineStepDuration } from './pipelineStepDuration.ts';
import { StepRunConsole } from './StepRunConsole.tsx';
import { StepRunDetail } from './StepRunDetail.tsx';

function stepHeadingLevel(depth: number): 3 | 4 | 5 | 6 {
	if (depth >= 3) return 6;
	if (depth === 2) return 5;
	if (depth === 1) return 4;
	return 3;
}

function stepInsetClass(depth: number): string {
	if (depth >= 2) return 'sm:mx-12';
	return 'sm:mx-6';
}

function StepRunQualifiers({ run }: { run: RunRecord | undefined }) {
	if (!run) return null;
	return (
		<>
			{hasParkedWorkMarker(run.summary) ? (
				<Tooltip content="This run parked its selected feature for human verification.">
					<Badge tone="amber">Work parked</Badge>
				</Tooltip>
			) : null}
			{run.stopReason === 'heartbeat_stale' ? (
				<Tooltip content="The run process stopped reporting a heartbeat and was reaped.">
					<Badge tone="amber">Process lost</Badge>
				</Tooltip>
			) : null}
		</>
	);
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
	attemptLabel,
	now,
	parentStepName,
	sessionErrorMessage,
	step,
	suppressName = false,
	suppressTiming = false,
	totalSteps,
}: {
	attemptLabel: null | string;
	now: number;
	parentStepName: null | string;
	sessionErrorMessage: null | string;
	step: PipelineStepResultRecord;
	suppressName?: boolean;
	suppressTiming?: boolean;
	totalSteps: number;
}) {
	// Only when it is the *same* sentence. A step that failed differently from the session — the
	// common case in `completed_with_failures`, where the session names the first failure and a
	// later step names its own — still says so here.
	const errorIsRestated = step.errorMessage !== null && step.errorMessage === sessionErrorMessage;
	const runQuery = useRunRecord(step.runId ?? undefined, step.runId !== null);
	const run = runQuery.data ?? undefined;
	return (
		// Nested rows sit inside both edges of their parent at `sm` and above. Below that threshold the
		// margin yields completely to the content column, while the rail and explicit parent label keep
		// the relationship visible without spending 24px per level on a phone.
		<div
			className={cn(
				step.depth > 0
					? 'border-l-2 border-control-border pt-2 pl-2 sm:pt-3 sm:pl-4'
					: 'mt-3 first:mt-0',
				step.depth > 0 && stepInsetClass(step.depth),
			)}>
			{step.depth > 0 ? (
				<p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
					<CornerDownRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
					<span className="min-w-0 truncate">
						Child of {parentStepName ?? 'parent step'}
					</span>
				</p>
			) : null}
			<Card variant={step.depth === 0 ? 'panel' : step.depth === 1 ? 'default' : 'sunken'}>
				{/* Step identities retain the readable section size. The collection uses a caption,
				    while nested relationships use the parent rail, inset and card treatment. */}
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
							{/* Only where there is more than one attempt to tell apart, so an
							    ordinary step never carries a badge saying it ran once. */}
							{attemptLabel ? <Badge tone="amber">{attemptLabel}</Badge> : null}
							<Badge tone="neutral">{stepTypeLabel(step.stepType)}</Badge>
							{step.depth === 0 ? (
								<Badge tone="neutral">
									Step {step.sequenceNumber} of {totalSteps}
								</Badge>
							) : null}
							{step.depth > 0 && parentStepName === step.stepName ? (
								<Badge tone="neutral">Nested under same-name parent</Badge>
							) : null}
							<StepRunQualifiers run={run} />
							{step.executionIdentity ? (
								<ExecutionIdentityBadges {...step.executionIdentity} />
							) : null}
						</>
					}
					className="mb-0"
					description={
						suppressTiming ? undefined : (
							// `tabular-nums` survives the move because it is on a span of its own; the
							// description slot sets its own colour and size and would otherwise drop it.
							<span className="tabular-nums">
								{formatDate(step.startedAt)} · {pipelineStepDuration(step, now)}
							</span>
						)
					}
					// Semantic depth follows the tree without shrinking each successive step title.
					headingLevel={stepHeadingLevel(step.depth)}
					level="section"
					title={suppressName ? 'Run detail' : step.stepName}
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
						run={run}
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
		<div className="mt-3 rounded-xl border border-dashed border-border bg-muted/40 p-4 first:mt-0">
			{/* Same header as the executed row above, at the same rank, so a pending step and a
			    finished one read as the same kind of thing in the same list. The dashed border, the
			    Pending badge and the description carry "not started"; the title does not have to,
			    so it takes the house heading colour rather than a one-off muted one. */}
			<CardHeader
				badge={
					<>
						<Badge tone="neutral">
							<CircleDashed className="h-3 w-3" />
							Pending
						</Badge>
						<Badge tone="neutral">{stepTypeLabel(step.stepType)}</Badge>
						<Badge tone="neutral">
							Step {sequenceNumber} of {totalSteps}
						</Badge>
					</>
				}
				className="mb-0"
				description="Not started yet"
				headingLevel={3}
				level="section"
				title={step.name}
			/>
		</div>
	);
}
