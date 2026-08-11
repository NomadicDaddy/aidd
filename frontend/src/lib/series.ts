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

/*
 * Separated by lightness, not by neighbouring hue. `failed` and `flagged` were eight degrees of hue
 * apart (red-500 against rose-700) and `stopped` and `noWork` were near-identical greys; at the 8px
 * a stacked segment or a legend dot actually gets, neither pair was separable on screen. Stepping
 * the lightness instead survives that size, and survives red-green CVD, which a red/rose split does
 * not. `noWork` additionally takes a hatched fill, so the one outcome that means "nothing ran" is
 * distinguishable by texture without relying on colour at all.
 *
 * The lightness step has to hold in *both* themes, and for a while it only held in one. `flagged`
 * and `killed` each carried a `dark:` variant that stepped the wrong way: measured on the rendered
 * page, dark-mode Failed (red-500, L 0.637) against Flagged (red-400, L 0.704) came out 0.082 apart
 * in OKLab and 3.1° apart in hue, and Warnings (amber-500, L 0.769) against Killed (orange-400,
 * L 0.750) came out 0.050 apart. Four of the eight swatches were two indistinguishable pairs at
 * legend-dot size, in the theme the console ships in, while the same measurement in light mode was
 * fine (0.24 and 0.16). `flagged` now darkens in dark mode instead of brightening, and `killed`
 * holds one step in both — the same direction the light values already went.
 */
export const outcomeSolid: Record<OutcomeSeriesKey, string> = {
	completed: toneSolid.emerald,
	failed: toneSolid.red,
	flagged: 'bg-red-900 dark:bg-red-700',
	killed: 'bg-orange-600',
	noWork: 'bg-muted-foreground/25 bg-[repeating-linear-gradient(45deg,currentColor_0_2px,transparent_2px_5px)] text-muted-foreground/40',
	running: toneSolid.teal,
	stopped: toneSolid.neutral,
	warnings: toneSolid.amber,
};

/** Group-hover fill matching `outcomeSolid`, for stacked segments that brighten on column hover. */
export const outcomeSolidHover: Record<OutcomeSeriesKey, string> = {
	completed: 'group-hover:bg-emerald-400 dark:group-hover:bg-emerald-500',
	failed: 'group-hover:bg-red-400 dark:group-hover:bg-red-400',
	flagged: 'group-hover:bg-red-800 dark:group-hover:bg-red-600',
	killed: 'group-hover:bg-orange-500',
	noWork: 'group-hover:opacity-80',
	running: 'group-hover:bg-teal-400 dark:group-hover:bg-teal-400',
	stopped: 'group-hover:opacity-80',
	warnings: 'group-hover:bg-amber-400 dark:group-hover:bg-amber-400',
};
