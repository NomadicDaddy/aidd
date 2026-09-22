import {
	isSkillExecutionIntent,
	skillExecutionIntentLabel,
} from 'aidd-shared/skill-execution-intent';

import type { PipelineSessionReport } from '../../api/types.ts';

import { Metric } from '../../components/shared/Metric.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Tooltip } from '../../components/ui/tooltip.tsx';
import { cn } from '../../lib/cn.ts';
import { formatActiveDuration, formatDate } from '../../lib/formatters.ts';
import {
	pipelineActiveStepLabel,
	pipelineStepsCompletedLabel,
} from '../../lib/pipelineProgress.ts';
import { toneSolid, toneText } from '../../lib/tones.ts';
import { proseMeasureClass } from '../../lib/typography.ts';
import { ParkedWorkBadge } from '../runs/ParkedWorkBadge.tsx';
import { sessionStatusLabel, sessionStatusTone } from '../runs/pipelineSessionStatus.ts';
import { buildStepRows } from './stepRowModel.ts';

/* This file's own `SummaryTile` was deleted here. It was the house metric treatment stepped
   down a size, restated — which is exactly what `Metric`'s `compact` size now is, so the strip
   reads the same and there is one declaration of it instead of four. */

/*
 * The widest step is 56rem, not the 61rem it used to be. This strip is a direct child of the
 * page rail with no card between them, so its container IS the rail — and the page declares the
 * reading content type, which is 61rem exactly. A `@min-[61rem]` step therefore fired only when
 * the container was precisely equal to its own maximum: one scrollbar, one pixel of padding, one
 * rounding step and five metrics silently became three. A breakpoint that holds only at exact
 * equality is not a breakpoint. 56rem leaves real headroom inside the rail, and the guard in
 * content-rail-contract.test.ts derives that ceiling from the rail rather than restating it.
 */
// The 32rem floor is the phone branch, not an oversight: this card measures 290px inside a
// 390px viewport and 260px inside a 360px one, so no step here fires on a phone and every count
// stacks. A 512px container is about a 612px viewport, and below that two columns of a label and
// a value — one of which is an exit code, a mode or a skill invocation — is narrower than the
// values are.
function metricGridClass(count: number): string {
	if (count === 1) return 'grid gap-3';
	if (count === 2) return 'grid gap-3 @min-[32rem]:grid-cols-2';
	if (count === 3) {
		return 'grid gap-3 @min-[32rem]:grid-cols-2 @min-[45rem]:grid-cols-3';
	}
	if (count === 4) {
		return 'grid gap-3 @min-[32rem]:grid-cols-2 @min-[56rem]:grid-cols-4';
	}
	return 'grid gap-3 @min-[32rem]:grid-cols-2 @min-[45rem]:grid-cols-3 @min-[56rem]:grid-cols-5';
}

export function SessionSummaryCard({
	now,
	report,
}: {
	now: number;
	report: PipelineSessionReport;
}) {
	const skillIntents = report.recipeSteps.flatMap((step) => {
		const intent = step.configJson.executionIntent;
		return step.stepType === 'skill' && isSkillExecutionIntent(intent) ? [intent] : [];
	});
	const stepCount = buildStepRows(report).length;
	const showProgress = stepCount > 1;
	const metricCount = 3 + Number(skillIntents.length > 0) + Number(showProgress);
	const hasFullStatus = report.session.errorMessage !== null;
	const gridMetricCount = hasFullStatus ? metricCount - 1 : metricCount;
	const progressLabel = pipelineStepsCompletedLabel(report.session);
	// Skipped steps are finished too; leaving them out left an early-ended session's bar part-full.
	const finishedSteps =
		report.session.completedTopLevelSteps + report.session.skippedTopLevelSteps;
	const progressPercent =
		report.session.totalSteps > 0
			? Math.min(100, Math.max(0, (finishedSteps / report.session.totalSteps) * 100))
			: 0;
	return (
		<div className="@container">
			{/* Status is first in source and visual order, but a badge by itself does not draw a
			    report-wide panel. A real failure explanation earns the full row; otherwise status
			    joins the facts it summarizes. The column count follows the number of facts so the wide
			    layout has no orphan tile. */}
			<div className={metricGridClass(gridMetricCount)}>
				<Metric
					className={cn(
						'min-w-0',
						hasFullStatus &&
							'@min-[32rem]:col-span-2 @min-[45rem]:col-span-3 @min-[56rem]:col-span-full',
					)}
					detail={
						report.session.errorMessage ? (
							// The surviving copy of the failure sentence, so it is the one that gets
							// the reading measure. `block` because `proseMeasureClass` caps a width,
							// and an inline span has none to cap.
							<span
								className={cn(
									'block',
									proseMeasureClass,
									report.session.status === 'completed_with_failures'
										? toneText.amber
										: toneText.red,
								)}>
								{report.session.errorMessage}
							</span>
						) : undefined
					}
					label="Status"
					size="compact"
					value={
						<div className="flex flex-wrap items-center gap-1.5">
							<Badge tone={sessionStatusTone(report.session.status)}>
								{sessionStatusLabel(report.session.status)}
							</Badge>
							<ParkedWorkBadge parkedWorkRuns={report.session.parkedWorkRuns} />
						</div>
					}
				/>
				{skillIntents.length > 0 ? (
					<Metric
						className="min-w-0"
						label="Skill directive intent"
						size="compact"
						value={
							<div className="flex flex-wrap gap-1.5">
								{[...new Set(skillIntents)].map((intent) => (
									<Tooltip
										content="Skill steps are directive runs, not audits. Review-only is instruction-enforced."
										key={intent}>
										<Badge tone="neutral">
											{skillExecutionIntentLabel(intent)}
										</Badge>
									</Tooltip>
								))}
							</div>
						}
					/>
				) : null}
				<Metric
					className="min-w-0"
					label="Started"
					size="compact"
					value={formatDate(report.session.startedAt)}
					wrapValue
				/>
				<Metric
					className="min-w-0"
					label="Duration"
					size="compact"
					value={formatActiveDuration(
						report.session.durationMs,
						report.session.startedAt,
						now,
					)}
				/>
				{showProgress ? (
					<Metric
						className="min-w-0"
						detail={pipelineActiveStepLabel(report.session) ?? undefined}
						footer={
							<div
								aria-label="Top-level steps finished"
								aria-valuemax={report.session.totalSteps}
								aria-valuemin={0}
								aria-valuenow={finishedSteps}
								aria-valuetext={progressLabel}
								className="h-1 w-full overflow-hidden rounded-full bg-muted"
								role="progressbar">
								<div
									className={cn(
										'h-full rounded-full',
										toneSolid[sessionStatusTone(report.session.status)],
									)}
									style={{ width: `${progressPercent}%` }}
								/>
							</div>
						}
						label="Progress"
						size="compact"
						value={progressLabel}
						wrapValue
					/>
				) : null}
			</div>
		</div>
	);
}
