import { default as ListTree } from 'lucide-react/dist/esm/icons/list-tree';
import { default as Sparkles } from 'lucide-react/dist/esm/icons/sparkles';
import { default as SquareTerminal } from 'lucide-react/dist/esm/icons/square-terminal';
import { default as Terminal } from 'lucide-react/dist/esm/icons/terminal';

import type { RecipeStepDefinition, RecipeStepType } from '../../api/types.ts';

import { OverflowScroller } from '../../components/shared/OverflowScroller.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { type ConfigSummaryEntry, getConfigSummary } from './recipe-steps.ts';
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
 * `command` is the one block value that is a single line by construction, so it keeps the
 * non-wrapping treatment and the scrollport that goes with it — a shell command broken across three
 * lines at whatever spaces happen to fall near the edge is harder to read, not easier, and it can no
 * longer be copied as one line. Every other block is a prompt, an argument list or a nested path:
 * free text, where `whitespace-pre` turned a 358px column into a horizontal scrollport per paragraph
 * and hid the sentence rather than the indentation. Those wrap and keep their newlines.
 */
function isCommandEntry(entry: ConfigSummaryEntry): boolean {
	return entry.key === 'command';
}

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
		// `space-y-3` between entries against `mb-1` from a label to its own value: in one 358px
		// column every entry is a full-width stack, so the only thing left saying which label owns
		// which block is the gap, and an even one said nothing.
		<div className="min-w-0 space-y-3">
			{blockEntries.map((entry) => (
				<div className="min-w-0" key={entry.key}>
					<div className="mb-1 text-xs font-medium text-muted-foreground">
						{entry.label}:
					</div>
					{isCommandEntry(entry) ? (
						// The scrollport a raw `overflow-x-auto` was not. Measured at 2250x1309:
						// clientWidth 1862 against scrollWidth 3483, so 1623px — nearly half the
						// command — was hidden behind no fade, no resting scrollbar and no tab
						// stop. `surface="muted"` because this block is `bg-muted`, not a card:
						// the default `from-card` fade would be the wrong colour against it, the
						// same fault the project tab strip had against the page ground.
						<OverflowScroller
							ariaLabel={`${entry.label} value`}
							className="rounded-md border border-border bg-muted"
							scrollerClassName="px-2.5 py-2"
							surface="muted">
							<code className="block font-mono text-xs leading-5 whitespace-pre text-foreground">
								{entry.value}
							</code>
						</OverflowScroller>
					) : (
						<code className="block max-w-full rounded-md border border-border bg-muted px-2.5 py-2 font-mono text-xs leading-5 break-words whitespace-pre-wrap text-foreground">
							{entry.value}
						</code>
					)}
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
							<span className="font-medium whitespace-nowrap">{entry.label}:</span>
							<span className="font-mono break-all text-foreground">
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

	// Two tracks once the card itself is wide enough, one below that. At 2250x1309 each step was a
	// 1888px band whose content stopped between 231px and 568px in — measured empty right gutter of
	// 1320 to 1657px per step, five times over, with the list still running past the fold. The header
	// takes a 20rem track and the config takes the rest, so the gutter carries the configuration
	// instead of nothing and the list is half as tall. `61rem` is the content-column step: below it
	// the two tracks would be narrower than the config blocks need, so the stack is the right answer.
	const split =
		configSummary.length > 0
			? 'grid gap-3 @min-[61rem]:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]'
			: '';

	return (
		<div className="flex gap-3">
			<RecipeStepMarker isLast={isLast} stepNumber={stepNumber} />
			{/* The containment is declared here, not on the pipeline: this element is the card's own
			    width, without the marker rail, which is the width the split above is measured at. */}
			<div className="@container min-w-0 flex-1 pb-6">
				<Card className={`min-w-0 p-3 ${split}`}>
					<CardHeader
						badge={
							<>
								<Badge tone="neutral">
									<StepTypeIcon aria-hidden="true" className="h-3 w-3" />
									{step.stepType}
								</Badge>
								{hasOnFailure && (
									<Badge tone="amber">on failure: {step.onFailure}</Badge>
								)}
								{hasRetry && <Badge tone="neutral">retry: {step.retryCount}</Badge>}
							</>
						}
						// `mb-0` is safe because the Card spaces with `gap` in the split state and
						// holds a single child otherwise; see the note on CardHeader.
						className="mb-0"
						headingLevel={3}
						identifier={step.id}
						level="subsection"
						title={step.name}
					/>
					{configSummary.length > 0 && <ConfigSummary entries={configSummary} />}
				</Card>
			</div>
		</div>
	);
}
