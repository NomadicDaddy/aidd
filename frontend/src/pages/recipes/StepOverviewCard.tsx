import { default as ListTree } from 'lucide-react/dist/esm/icons/list-tree';
import { default as Sparkles } from 'lucide-react/dist/esm/icons/sparkles';
import { default as SquareTerminal } from 'lucide-react/dist/esm/icons/square-terminal';
import { default as Terminal } from 'lucide-react/dist/esm/icons/terminal';

import type { RecipeStepDefinition, RecipeStepType } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { Card } from '../../components/ui/card.tsx';
import { type ConfigSummaryEntry, getConfigSummary } from './recipe-steps.ts';

// Step type is taxonomy, not status: a `shell` step is not "needs attention" and a `recipe-ref`
// step is not "failed". Every type renders neutral and is distinguished by its glyph, leaving the
// operational tone scale free to mean what it says.
const stepTypeIcons: Record<RecipeStepType, typeof Terminal> = {
	'aidd-cli': Terminal,
	'recipe-ref': ListTree,
	shell: SquareTerminal,
	skill: Sparkles,
};

/**
 * A value long enough that truncating it into a chip would hide the part that identifies it — a
 * prompt, a nested path, an argument list. Roughly the width of a chip at this card's size, so
 * anything past it was already arriving as an ellipsis.
 */
const blockValueLength = 48;

function isBlockEntry(entry: ConfigSummaryEntry): boolean {
	return entry.value.length > blockValueLength || entry.value.includes('\n');
}

function ConfigSummary({ entries }: { entries: ConfigSummaryEntry[] }) {
	// `command` is always a block because it is always read as a command line, whatever its length.
	// Everything else earns the block by being too long to survive a chip, which is the same rule
	// applied to the same kind of value rather than a list of privileged keys.
	const blockEntries = entries.filter((entry) => entry.key === 'command' || isBlockEntry(entry));
	const chipEntries = entries.filter((entry) => !blockEntries.includes(entry));

	return (
		<div className="min-w-0 space-y-2">
			{blockEntries.map((entry) => (
				<div className="min-w-0" key={entry.key}>
					<div className="mb-1 text-xs font-medium text-muted-foreground">
						{entry.label}:
					</div>
					<code className="block max-w-full overflow-x-auto rounded-md border border-border bg-muted px-2.5 py-2 font-mono text-xs leading-5 whitespace-pre text-foreground">
						{entry.value}
					</code>
				</div>
			))}
			{chipEntries.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{chipEntries.map((entry) => (
						// One treatment for every chip. Half of them used to render in the accent
						// colour because a table in recipe-steps.ts called their key "primary",
						// which put `command` and `skillId` in the tone the app spends on live
						// state — a step's configuration is not a status, and the reader has no way
						// to know which keys were on that list. The label stays in the body face
						// and the value goes `font-mono`, because the label is a word and the value
						// is a machine string.
						<span
							className="inline-flex max-w-full min-w-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
							key={entry.key}
							title={`${entry.label}: ${entry.value}`}>
							<span className="font-medium whitespace-nowrap">{entry.label}:</span>
							<span className="truncate font-mono text-foreground">
								{entry.value}
							</span>
						</span>
					))}
				</div>
			)}
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
	const StepTypeIcon = stepTypeIcons[step.stepType];

	return (
		<div className="flex gap-3">
			<div className="flex flex-col items-center">
				<div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground ring-2 ring-card">
					{stepNumber}
				</div>
				{!isLast && <div className="w-px flex-1 bg-border" />}
			</div>
			<div className="min-w-0 flex-1 pb-6">
				<Card className="min-w-0 p-3">
					<header className="mb-2 flex flex-wrap items-center gap-2">
						<h3 className="text-sm font-semibold text-foreground">{step.name}</h3>
						<Badge tone="neutral">
							<StepTypeIcon aria-hidden="true" className="h-3 w-3" />
							{step.stepType}
						</Badge>
						{hasOnFailure && <Badge tone="amber">on failure: {step.onFailure}</Badge>}
						{hasRetry && <Badge tone="neutral">retry: {step.retryCount}</Badge>}
					</header>
					{configSummary.length > 0 && <ConfigSummary entries={configSummary} />}
				</Card>
			</div>
		</div>
	);
}
