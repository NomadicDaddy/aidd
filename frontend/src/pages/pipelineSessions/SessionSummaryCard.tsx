import {
	isSkillExecutionIntent,
	skillExecutionIntentLabel,
} from 'aidd-shared/skill-execution-intent';

import type { PipelineSessionReport } from '../../api/types.ts';

import { Metric } from '../../components/shared/Metric.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { formatActiveDuration, formatDate } from '../../lib/formatters.ts';
import { toneText } from '../../lib/tones.ts';
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
		// table in AppLayout.tsx for why those are different numbers. The middle step exists so five
		// (or six, with the skill-intent tile) items divide evenly instead of leaving PROGRESS alone
		// against an empty cell.
		<div className="@container">
			<div className="grid gap-3 @min-[32rem]:grid-cols-2 @min-[45rem]:grid-cols-3 @min-[61rem]:grid-cols-5">
				<Metric
					className="min-w-0"
					detail={
						report.session.errorMessage ? (
							<span
								className={
									report.session.status === 'completed_with_failures'
										? toneText.amber
										: toneText.red
								}>
								{report.session.errorMessage}
							</span>
						) : undefined
					}
					label="Status"
					size="compact"
					value={
						<Badge tone={sessionStatusTone(report.session.status)}>
							{sessionStatusLabel(report.session.status)}
						</Badge>
					}
				/>
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
					label="Project"
					size="compact"
					value={
						<span className="block truncate" title={report.session.projectName}>
							{report.session.projectName}
						</span>
					}
				/>
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
