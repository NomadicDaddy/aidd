import type { RecipeStepDefinition, RecipeStepType } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { type ConfigSummaryEntry, getConfigSummary } from './recipe-steps.ts';

type BadgeTone = 'amber' | 'emerald' | 'neutral' | 'red' | 'teal';

const stepTypeTones: Record<RecipeStepType, BadgeTone> = {
	'aidd-cli': 'teal',
	'recipe-ref': 'red',
	shell: 'amber',
	skill: 'emerald',
};

function ConfigChips({ entries }: { entries: ConfigSummaryEntry[] }) {
	return (
		<div className="flex flex-wrap gap-1.5">
			{entries.map((entry) => (
				<span
					className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${
						entry.primary
							? 'bg-teal-50 font-medium text-teal-800 dark:bg-teal-950/40 dark:text-teal-300'
							: 'bg-muted text-muted-foreground'
					}`}
					key={entry.key}>
					<span className="font-medium">{entry.label}:</span> {entry.value}
				</span>
			))}
		</div>
	);
}

export function StepOverviewCard({
	isLast,
	step,
	stepNumber,
}: {
	isLast: boolean;
	step: RecipeStepDefinition;
	stepNumber: number;
}) {
	const configSummary = getConfigSummary(step.stepType, step.configJson);
	const hasOnFailure = step.onFailure && step.onFailure !== 'stop';
	const hasRetry = step.retryCount !== undefined && step.retryCount > 0;

	return (
		<div className="flex gap-3">
			<div className="flex flex-col items-center">
				<div className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-700 text-xs font-bold text-white dark:bg-teal-400">
					{stepNumber}
				</div>
				{!isLast && <div className="w-px flex-1 bg-muted" />}
			</div>
			<div className={`flex-1 pb-6 ${isLast ? '' : ''}`}>
				<div className="rounded-md border border-border bg-card p-3">
					<div className="mb-2 flex flex-wrap items-center gap-2">
						<h3 className="text-sm font-semibold text-foreground">{step.name}</h3>
						<Badge tone={stepTypeTones[step.stepType]}>{step.stepType}</Badge>
						{hasOnFailure && <Badge tone="amber">on failure: {step.onFailure}</Badge>}
						{hasRetry && <Badge tone="neutral">retry: {step.retryCount}</Badge>}
					</div>
					{configSummary.length > 0 && <ConfigChips entries={configSummary} />}
				</div>
			</div>
		</div>
	);
}
