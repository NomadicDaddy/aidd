import { cn } from './cn.ts';
import { microLabelClass } from './typography.ts';

/**
 * The one header strip for a data table.
 *
 * The sweep found this exact class list copied verbatim into six tables, which is how one of them
 * drifted: `UnifiedExecutionTable` had already lost `border-border` off its `border-b` while the
 * others kept it. Importing the string is what keeps a token change to a single edit. Header cells
 * explicitly inherit the declared weight because the browser's native `<th>` rule otherwise wins
 * over the weight inherited from `<thead>`. The strip owns the sticky position; every painted layer
 * belongs to each cell because independently pinned identity columns leave the `<thead>` box behind.
 * `border-control-border` is the established hairline that remains perceptible against `bg-muted`;
 * `border-border` measured only 1.11:1 there.
 */
export const tableHeadClass = cn(
	'sticky top-0 z-20 text-muted-foreground',
	'[&_th]:border-b [&_th]:border-control-border [&_th]:bg-muted [&_th]:[font-weight:inherit]',
	microLabelClass,
);

/**
 * The default sizing contract for mixed-content data tables.
 *
 * `table-auto` lets every column's minimum content width participate in layout. Pair compact
 * columns or cells with `contentSizedColumnClass`; leave columns that can use spare room
 * unconstrained.
 */
export const contentSizedTableClass = 'w-full table-auto text-left text-sm';

/** A compact auto-layout column: one nominal pixel expands to its intrinsic content minimum. */
export const contentSizedColumnClass = 'w-px';

/**
 * The declared page column a table composition occupies.
 *
 * Everything that has to line up with the table — the filter toolbar above it, the card framing it,
 * its sibling panels — takes its right edge from this one constant, so the edge is a value the
 * composition declares rather than a width the widest row happened to contribute. That distinction
 * is the finding. While the measure below was the only one available, every element carrying it
 * sized itself from its own content: the Runs tab's three peer cards started at one left edge and
 * ended at three different right ones — 1280 / 1962 / 1280 measured at 2250x1309, widening to a
 * 992px ragged edge at 2560x1440 — and the audits and reports tabs handed their filter toolbar a
 * width sourced from the table underneath it.
 *
 * 80rem is the resting measure the tables were tuned against, and it stays a ceiling rather than a
 * target: a composition whose columns genuinely measure past it keeps `OverflowScroller`, which
 * takes the shortfall and keeps its edge affordance. Widening the column to the intrinsic
 * requirement instead is what put the ragged edge there in the first place. Form grids sit a step
 * wider at `formGridMeasureClass` (90rem), because a three-column grid of labelled controls needs
 * column width that a table's own `min-w-*` floor already guarantees.
 *
 * Apply it to the element that owns the column for its siblings: the composition root where a
 * toolbar and a table share one, the outer Card where that card is the whole composition. Never to
 * scrolled content — that is `tableMeasureClass`, and the two jobs were one constant until this
 * record separated them.
 *
 * The sweep's own proposal for the Runs tab — hoist the measure to the tab wrapper and let the
 * three cards fill it — stays rejected, and is recorded here so the next sweep does not re-file it.
 * Hoisted while the measure was intrinsic, the wrapper would have taken its width from the widest
 * panel's content, which is the defect rather than its fix; and it wraps one declared column around
 * three panels that each draw their own chrome and appear on their own elsewhere. The cards keep
 * the column. A declared value is what makes them agree.
 */
export const tableColumnClass = 'w-full max-w-[80rem]';

/**
 * The intrinsic measure, for content inside a scrollport.
 *
 * The tables in this app declare a `min-w-*` floor — the width below which their columns stop being
 * readable — and nothing above it, so on a 2250px screen they tracked the shell to 1938px and spent
 * every extra pixel on the tracks that needed it least: an integer score column 260px wide, a
 * two-word status column 300px wide, and the one column carrying a name still truncating.
 *
 * The floor answers "how narrow before this breaks"; this answers "how wide before it stops
 * helping", and they are different questions. Measured again on the project Runs tab at 2250x1309:
 * the execution-target chip ended at x=430 and the RUNS figure belonging to the same row sat at
 * x=1400, roughly 950px of empty row, nineteen rows deep. `w-max` lets scrolled content contribute
 * its intrinsic requirement, the minimum retains the 80rem resting measure for narrower content,
 * and `max-w-full` clamps the result to the scrollport.
 *
 * Apply it to a row list or scroller inside a card that already owns the page column — a dashboard
 * card whose grid track sizes it, a panel whose Card draws the chrome. Applying it to the card
 * itself makes that card's right edge a function of its content, which is the defect
 * `tableColumnClass` exists to remove.
 */
export const tableMeasureClass = 'w-max min-w-[min(100%,80rem)] max-w-full';

/** The seam a left-pinned column casts over cells scrolling beneath its right edge. */
export const pinnedLeftEdgeClass = 'shadow-[inset_-8px_0_8px_-8px_rgba(0,0,0,0.35)]';

/** Shared feedback for rows containing focusable controls or destinations. */
export const interactiveTableRowClass =
	'transition-colors hover:bg-muted/40 focus-within:bg-muted/40';
