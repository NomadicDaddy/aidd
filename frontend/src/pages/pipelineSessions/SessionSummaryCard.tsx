import {
	isSkillExecutionIntent,
	skillExecutionIntentLabel,
} from 'aidd-shared/skill-execution-intent';

import type { PipelineSessionReport } from '../../api/types.ts';

import { Metric } from '../../components/shared/Metric.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { cn } from '../../lib/cn.ts';
import { formatActiveDuration, formatDate } from '../../lib/formatters.ts';
import { toneText } from '../../lib/tones.ts';
import { proseMeasureClass } from '../../lib/typography.ts';
import { sessionStatusLabel, sessionStatusTone } from '../runs/pipelineSessionStatus.ts';

/* This file's own `SummaryTile` was deleted here. It was the house metric treatment stepped
   down a size, restated — which is exactly what `Metric`'s `compact` size now is, so the strip
   reads the same and there is one declaration of it instead of four. */

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
	return (
		// The steps are keyed off this strip's own width, not the viewport's — see the content-width
		// table in AppLayout.tsx for why those are different numbers.
		<div className="@container space-y-3">
			{/* STATUS is what the page is being opened to find out, and at 390px it was the first of
			    five tiles of equal weight in a single stacked column — the reader scrolled a strip of
			    interchangeable cards looking for the one that answered the question. It leads now, at
			    the default value size and the panel surface that comes with it, and the rest of the
			    strip is metadata sitting under it at `compact` on the sunken surface. That is the
			    same hierarchy the report's PageHeader states one line above: session identity first,
			    detail after. */}
			<Metric
				className="min-w-0"
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
				value={
					<Badge tone={sessionStatusTone(report.session.status)}>
						{sessionStatusLabel(report.session.status)}
					</Badge>
				}
			/>
			{/* The column count follows the tile count so the last row is never one tile against
			    empty cells — three without a skill step, four with one. */}
			<div
				className={cn(
					'grid gap-3 @min-[32rem]:grid-cols-2',
					skillIntents.length > 0
						? '@min-[45rem]:grid-cols-4'
						: '@min-[45rem]:grid-cols-3',
				)}>
				{skillIntents.length > 0 ? (
					<Metric
						className="min-w-0"
						detail="Skill steps are directive runs, not audits. Review-only is instruction-enforced."
						label="Skill directive intent"
						size="compact"
						value={
							<div className="flex flex-wrap gap-1.5">
								{[...new Set(skillIntents)].map((intent) => (
									<Badge key={intent} tone="neutral">
										{skillExecutionIntentLabel(intent)}
									</Badge>
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
				<Metric
					className="min-w-0"
					label="Progress"
					size="compact"
					value={
						<span
							title={`Step ${report.session.currentStepIndex} of ${report.session.totalSteps}`}>
							{report.session.currentStepIndex} / {report.session.totalSteps}
						</span>
					}
				/>
			</div>
		</div>
	);
}
