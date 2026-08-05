/**
 * Categorical series palette — identity colors for chart series and count breakdowns.
 *
 * This is deliberately NOT the status scale in `lib/tones.ts`. Tones answer "how is this doing?"
 * (`emerald` = healthy, `red` = failure); series slots answer "which series is this?" and carry no
 * health meaning at all. Keeping them apart is what stops a chart from claiming that its second
 * series is in trouble, and stops taxonomy from spending a tone the status scale needs.
 *
 * Slots are intentionally named by position rather than by hue or meaning: consumers assign them in
 * declaration order and never infer semantics from the name. Each slot is theme-safe — a mid-range
 * fill in light mode and a lighter step in dark mode, so a dot or bar stays legible on both
 * backgrounds without the consumer writing its own `dark:` variant.
 *
 * Chart and summary components import from here instead of declaring literal color classes inline,
 * so the categorical palette has one canonical declaration in the same way tones do.
 */
import { toneSolid } from './tones.ts';

export type SeriesSlot = 'slot1' | 'slot2' | 'slot3' | 'slot4';

/** Solid fill for series dots, legend swatches, and bars. */
export const seriesSolid: Record<SeriesSlot, string> = {
	slot1: 'bg-cyan-600 dark:bg-cyan-400',
	slot2: 'bg-indigo-600 dark:bg-indigo-400',
	slot3: 'bg-fuchsia-600 dark:bg-fuchsia-400',
	slot4: 'bg-lime-600 dark:bg-lime-400',
};

/** Group-hover fill matching `seriesSolid`, for bars that brighten when their column is hovered. */
export const seriesSolidHover: Record<SeriesSlot, string> = {
	slot1: 'group-hover:bg-cyan-500 dark:group-hover:bg-cyan-300',
	slot2: 'group-hover:bg-indigo-500 dark:group-hover:bg-indigo-300',
	slot3: 'group-hover:bg-fuchsia-500 dark:group-hover:bg-fuchsia-300',
	slot4: 'group-hover:bg-lime-500 dark:group-hover:bg-lime-300',
};

/**
 * The eight invocation outcomes as a chart ramp.
 *
 * A `Badge` shows one status at a time, so the six-tone scale is enough for it. A stacked bar shows
 * all eight outcomes touching each other, where `failed`/`flagged`/`killed` collapsing to one red —
 * and `stopped`/`no work` to one grey — would make the segments unreadable. This ramp anchors the
 * six outcomes that map cleanly onto `toneSolid` and adds a separated step for the two that do not,
 * so severity still reads left-to-right without inventing a second status vocabulary.
 *
 * Declared once and shared by the summary dots, the stacked bars, and the chart legend, so those
 * three surfaces cannot drift apart. Use `toneBadge`/`toneSolid` for a single status; use this only
 * where outcomes are rendered together as a distribution.
 */
export type OutcomeSeriesKey =
	'completed' | 'failed' | 'flagged' | 'killed' | 'noWork' | 'running' | 'stopped' | 'warnings';

export const outcomeSolid: Record<OutcomeSeriesKey, string> = {
	completed: toneSolid.emerald,
	failed: toneSolid.red,
	flagged: 'bg-rose-700 dark:bg-rose-600',
	killed: 'bg-orange-700 dark:bg-orange-600',
	noWork: 'bg-muted-foreground/50',
	running: toneSolid.teal,
	stopped: toneSolid.neutral,
	warnings: toneSolid.amber,
};

/** Group-hover fill matching `outcomeSolid`, for stacked segments that brighten on column hover. */
export const outcomeSolidHover: Record<OutcomeSeriesKey, string> = {
	completed: 'group-hover:bg-emerald-400 dark:group-hover:bg-emerald-500',
	failed: 'group-hover:bg-red-400 dark:group-hover:bg-red-400',
	flagged: 'group-hover:bg-rose-600 dark:group-hover:bg-rose-500',
	killed: 'group-hover:bg-orange-600 dark:group-hover:bg-orange-500',
	noWork: 'group-hover:opacity-80',
	running: 'group-hover:bg-teal-400 dark:group-hover:bg-teal-400',
	stopped: 'group-hover:opacity-80',
	warnings: 'group-hover:bg-amber-400 dark:group-hover:bg-amber-400',
};
