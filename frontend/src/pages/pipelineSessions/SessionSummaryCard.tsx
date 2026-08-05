import {
	isSkillExecutionIntent,
	skillExecutionIntentLabel,
} from 'aidd-shared/skill-execution-intent';
import { type ReactNode } from 'react';

import type { PipelineSessionReport } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { Card } from '../../components/ui/card.tsx';
import { cn } from '../../lib/cn.ts';
import { formatActiveDuration, formatDate } from '../../lib/formatters.ts';
import { toneText } from '../../lib/tones.ts';
import { sessionStatusLabel, sessionStatusTone } from '../runs/pipelineSessionStatus.ts';

/**
 * One summary pair. The label/value typography is the house metric treatment (see dashboard's
 * `Metric`) stepped down a size, because this strip carries five to six items rather than three —
 * previously every value here was flat `text-sm` body text inside a single card, so the top of the
 * report had no weight at all and the eye jumped straight to the log block below.
 */
function SummaryTile({
	children,
	label,
	numeric = false,
}: {
	children: ReactNode;
	label: string;
	numeric?: boolean;
}) {
	return (
		<Card className="min-w-0" variant="sunken">
			<p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
				{label}
			</p>
			<div
				className={cn(
					'mt-2 font-display text-lg font-semibold text-card-foreground',
					numeric && 'tabular-nums',
				)}>
				{children}
			</div>
		</Card>
	);
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
	return (
		// The `lg` step exists so five (or six, with the skill-intent tile) items divide evenly at the
		// middle width instead of leaving PROGRESS alone against an empty cell at 768.
		<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
			<SummaryTile label="Status">
				<Badge tone={sessionStatusTone(report.session.status)}>
					{sessionStatusLabel(report.session.status)}
				</Badge>
				{report.session.errorMessage && (
					<p
						className={cn(
							'mt-2 text-sm font-normal',
							report.session.status === 'completed_with_failures'
								? toneText.amber
								: toneText.red,
						)}>
						{report.session.errorMessage}
					</p>
				)}
			</SummaryTile>
			{skillIntents.length > 0 ? (
				<SummaryTile label="Skill directive intent">
					<div className="flex flex-wrap gap-1.5">
						{[...new Set(skillIntents)].map((intent) => (
							<Badge key={intent} tone={intent === 'review-only' ? 'teal' : 'amber'}>
								{skillExecutionIntentLabel(intent)}
							</Badge>
						))}
					</div>
					<p className="mt-1 text-xs font-normal text-muted-foreground">
						Skill steps are directive runs, not audits. Review-only is
						instruction-enforced.
					</p>
				</SummaryTile>
			) : null}
			<SummaryTile label="Project">
				<span className="block truncate" title={report.session.projectName}>
					{report.session.projectName}
				</span>
			</SummaryTile>
			<SummaryTile label="Started">{formatDate(report.session.startedAt)}</SummaryTile>
			<SummaryTile label="Duration" numeric>
				{formatActiveDuration(report.session.durationMs, report.session.startedAt, now)}
			</SummaryTile>
			<SummaryTile label="Progress" numeric>
				<span
					title={`Step ${report.session.currentStepIndex} of ${report.session.totalSteps}`}>
					{report.session.currentStepIndex} / {report.session.totalSteps}
				</span>
			</SummaryTile>
		</div>
	);
}
