import type { RecipeStepDefinition, RecipeStepType } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { type ConfigSummaryEntry, getConfigSummary } from './recipe-steps.ts';

type BadgeTone = 'amber' | 'cyan' | 'emerald' | 'neutral' | 'red';

const stepTypeTones: Record<RecipeStepType, BadgeTone> = {
	'aidd-cli': 'cyan',
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
							? 'bg-cyan-50 font-medium text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300'
							: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
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
				<div className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-700 text-xs font-bold text-white dark:bg-cyan-400 dark:text-slate-950">
					{stepNumber}
				</div>
				{!isLast && <div className="w-px flex-1 bg-neutral-200 dark:bg-neutral-700" />}
			</div>
			<div className={`flex-1 pb-6 ${isLast ? '' : ''}`}>
				<div className="rounded-md border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
					<div className="mb-2 flex flex-wrap items-center gap-2">
						<h3 className="text-sm font-semibold text-neutral-950 dark:text-neutral-50">
							{step.name}
						</h3>
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
