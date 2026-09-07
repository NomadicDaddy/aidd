import { default as ListTree } from 'lucide-react/dist/esm/icons/list-tree';
import { default as Sparkles } from 'lucide-react/dist/esm/icons/sparkles';
import { default as SquareTerminal } from 'lucide-react/dist/esm/icons/square-terminal';
import { default as Terminal } from 'lucide-react/dist/esm/icons/terminal';

import type { RecipeStepDefinition, RecipeStepType } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { cn } from '../../lib/cn.ts';
import {
	type ConfigSummaryEntry,
	getConfigSummary,
	getStepBehaviorSummary,
	type StepBehaviorSummary,
} from './recipe-config-summary.ts';
import { RecipeStepMarker } from './RecipeStepMarker.tsx';

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
 * A value long enough that a pill stops reading as one — a prompt, a nested path, an argument list.
 * Roughly the width of a chip at this card's size: past it the value wants a full-width line of its
 * own rather than a pill wrapping onto four.
 */
const blockValueLength = 48;

/**
 * `command` is always promoted from a chip to a labelled block. Blocks wrap at available width so
 * long commands, prompts, argument lists, and nested paths remain visible without creating a
 * horizontal scrollport for every value; `whitespace-pre-wrap` preserves authored newlines.
 */
function isBlockEntry(entry: ConfigSummaryEntry): boolean {
	return entry.value.length > blockValueLength || entry.value.includes('\n');
}

function ConfigSummary({ entries }: { entries: ConfigSummaryEntry[] }) {
	// `command` is always a block because it is always read as a command line, whatever its length.
	// Everything else earns the block by being too long to survive a chip, which is the same rule
	// applied to the same kind of value rather than a list of privileged keys.
	const blockEntries = entries.filter((entry) => entry.key === 'command' || isBlockEntry(entry));
	const chipEntries = entries.filter((entry) => !blockEntries.includes(entry));
	const leadingBlockEntries = blockEntries.filter((entry) => entry.key !== 'args');
	const trailingBlockEntries = blockEntries.filter((entry) => entry.key === 'args');

	function renderBlock(entry: ConfigSummaryEntry) {
		return (
			<div className="min-w-0" key={entry.key}>
				<div
					className={cn(
						'mb-1 text-xs font-medium text-muted-foreground',
						entry.labelIsMachine && 'font-mono',
					)}>
					{entry.label}:
				</div>
				<code className="block max-w-full rounded-md border border-border bg-muted px-2.5 py-2 font-mono text-xs leading-5 [overflow-wrap:anywhere] break-words whitespace-pre-wrap text-foreground">
					{entry.value}
				</code>
			</div>
		);
	}

	return (
		// `space-y-3` between entries against `mb-1` from a label to its own value: in one 358px
		// column every entry is a full-width stack, so the only thing left saying which label owns
		// which block is the gap, and an even one said nothing.
		<div className="min-w-0 space-y-3">
			{leadingBlockEntries.map(renderBlock)}
			{chipEntries.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{chipEntries.map((entry) => (
						// One treatment for every chip. Rendering half of them in the accent colour
						// because a table somewhere calls their key "primary" would put `command`
						// and `skillId` in the tone the app spends on live state — a step's
						// configuration is not a status, and the reader has no way to know which
						// keys are on that list. The label stays in the body face
						// and the value goes `font-mono`, because the label is a word and the value
						// is a machine string.
						//
						// The value wraps rather than truncating. `truncate` cuts the tail, and the
						// tail is where these values differ: `skillId` and `recipeName` share a
						// prefix far more often than they share an ending, so a chip narrowed to
						// 358px ellipsed away the only part that said which one it was. Nothing
						// here is longer than `blockValueLength` — anything that is has already
						// become a block — so the worst case is two lines in the pill, and the
						// `title` still carries the whole thing for a pointer.
						<span
							className="inline-flex max-w-full min-w-0 items-start gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
							key={entry.key}
							title={`${entry.label}: ${entry.value}`}>
							<span
								className={cn(
									'font-medium whitespace-nowrap',
									entry.labelIsMachine && 'font-mono',
								)}>
								{entry.label}:
							</span>
							<span className="font-mono break-words text-foreground">
								{entry.value}
							</span>
						</span>
					))}
				</div>
			)}
			{trailingBlockEntries.map(renderBlock)}
		</div>
	);
}

function HookSummary({ entries, title }: { entries: ConfigSummaryEntry[]; title: string }) {
	if (entries.length === 0) return null;
	return (
		<section className="min-w-0 space-y-2">
			<h4 className="text-xs font-semibold text-foreground">{title}</h4>
			<ConfigSummary entries={entries} />
		</section>
	);
}

function StepBehaviorSummary({
	separated,
	summary,
}: {
	separated: boolean;
	summary: StepBehaviorSummary;
}) {
	return (
		<div className={cn('min-w-0 space-y-3', separated && 'border-t border-border pt-3')}>
			{summary.when && (
				<section className="min-w-0 space-y-1.5">
					<h4 className="text-xs font-semibold text-foreground">Run condition</h4>
					<p className="text-sm break-words text-muted-foreground">
						Run when{' '}
						<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
							{summary.when.parameter}
						</code>{' '}
						equals{' '}
						<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
							{summary.when.equals}.
						</code>
					</p>
				</section>
			)}
			<HookSummary entries={summary.preHook} title="Before step hook" />
			<HookSummary entries={summary.postHook} title="After step hook" />
		</div>
	);
}

export function StepOverviewCard({
	isLast,
	step,
	stepNumber,
	suppressIntent,
}: {
	isLast: boolean;
	step: RecipeStepDefinition;
	stepNumber: number;
	suppressIntent?: string | undefined;
}) {
	const configSummary = getConfigSummary(step.stepType, step.configJson).filter(
		(entry) => !(entry.key === 'executionIntent' && entry.value === suppressIntent),
	);
	const behaviorSummary = getStepBehaviorSummary(step);
	const hasBehaviorSummary =
		behaviorSummary.when !== null ||
		behaviorSummary.preHook.length > 0 ||
		behaviorSummary.postHook.length > 0;
	const hasSummary = configSummary.length > 0 || hasBehaviorSummary;
	const hasOnFailure = step.onFailure && step.onFailure !== 'stop';
	const hasRetry = step.retryCount !== undefined && step.retryCount > 0;
	const StepTypeIcon = stepTypeIcons[step.stepType];

	// Two tracks once the card itself is wide enough, one below that. The header keeps a stable 20rem
	// measure and the machine-value track takes every remaining pixel. Capping that second track at
	// the narrative 61rem measure hid most long commands while leaving unused card width beside it.
	// `61rem` remains only the container-query step: below it the two tracks would be narrower than
	// the config blocks need, so the stack is the right answer.
	const split = hasSummary
		? 'grid gap-3 @min-[61rem]:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]'
		: '';

	return (
		<div className="flex gap-3">
			<RecipeStepMarker isLast={isLast} stepNumber={stepNumber} />
			{/* The containment is declared here, not on the pipeline: this element is the card's own
			    width, without the marker rail, which is the width the split above is measured at. */}
			<div className={`@container min-w-0 flex-1 ${isLast ? 'pb-0' : 'pb-6'}`}>
				<Card className={`min-w-0 p-3 ${split}`} variant="sunken">
					<CardHeader
						badge={
							<>
								{hasOnFailure && (
									<Badge tone="neutral">on failure: {step.onFailure}</Badge>
								)}
								{hasRetry && <Badge tone="neutral">retry: {step.retryCount}</Badge>}
							</>
						}
						// `mb-0` is safe because the Card spaces with `gap` in the split state and
						// holds a single child otherwise; see the note on CardHeader.
						className="mb-0 min-w-0"
						headingLevel={3}
						identifier={
							<span className="flex min-w-0 items-center gap-2">
								<Badge tone="neutral">
									<StepTypeIcon aria-hidden="true" className="h-3 w-3" />
									{step.stepType}
								</Badge>
								<span className="truncate">{step.id}</span>
							</span>
						}
						level="subsection"
						title={
							<span className="flex min-w-0 items-start gap-2">
								<span className="shrink-0 text-xs text-muted-foreground sm:hidden">
									{stepNumber}.
								</span>
								<span className="min-w-0 break-words">{step.name}</span>
							</span>
						}
					/>
					{hasSummary && (
						<div className="min-w-0 space-y-4">
							{configSummary.length > 0 && <ConfigSummary entries={configSummary} />}
							{hasBehaviorSummary && (
								<StepBehaviorSummary
									separated={configSummary.length > 0}
									summary={behaviorSummary}
								/>
							)}
						</div>
					)}
				</Card>
			</div>
		</div>
	);
}
