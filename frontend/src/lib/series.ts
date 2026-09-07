/**
 * Series presentation — identity cues for chart series and count breakdowns.
 *
 * This is deliberately NOT the status scale in `lib/tones.ts`. Tones answer "how is this doing?"
 * (`emerald` = healthy, `red` = failure); series cues answer "which series is this?" and carry no
 * health meaning at all. Keeping them apart is what stops a chart from claiming that its second
 * series is in trouble, and stops taxonomy from spending a tone the status scale needs.
 *
 * Chart and summary components import from here instead of declaring presentation classes inline,
 * so the series vocabulary has one canonical declaration in the same way tones do.
 */
import {
	type TelemetryOutcomeBucket,
	telemetryOutcomePresentation,
} from 'aidd-shared/runs/outcome';

import { toneSolid } from './tones.ts';

export type OutputSeriesKey = 'counterpart' | 'produced';

/** Semantic fills for the produced and counterpart arms of the Agent output chart. */
export const outputSeriesSolid: Record<OutputSeriesKey, string> = {
	counterpart: 'bg-muted-foreground/60',
	produced: 'bg-accent/80',
};

/** Group-hover fills matching `outputSeriesSolid`. */
export const outputSeriesSolidHover: Record<OutputSeriesKey, string> = {
	counterpart: 'group-hover:bg-muted-foreground/75',
	produced: 'group-hover:bg-accent',
};

/** Non-colour identity cues shared by the output bars and their legend swatches. */
export const outputSeriesPattern: Record<OutputSeriesKey, string> = {
	counterpart:
		'bg-[repeating-linear-gradient(45deg,transparent_0_3px,currentColor_3px_4px)] text-background/20',
	produced:
		'bg-[repeating-linear-gradient(90deg,transparent_0_4px,currentColor_4px_5px)] text-accent-foreground/20',
};

/** Categorical fills for the provenance of a Feature in the dependency graph. */
export type SourceSeriesKey = 'audit' | 'feature' | 'remediation';

/**
 * Feature is the common source, so its rail stays neutral. Audit and remediation are exceptions
 * worth finding in the graph and reuse the semantic solids that already identify them elsewhere.
 */
export const sourceSolid: Record<SourceSeriesKey, string> = {
	audit: toneSolid.amber,
	feature: 'bg-muted-foreground/60',
	remediation: toneSolid.red,
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
export type OutcomeSeriesKey = TelemetryOutcomeBucket;

/*
 * Separated by lightness, not by neighbouring hue. `failed` and `flagged` were eight degrees of hue
 * apart (red-500 against rose-700) and `stopped` and `noWork` were near-identical greys; at the 8px
 * a stacked segment or a legend dot actually gets, neither pair was separable on screen. Stepping
 * the lightness instead survives that size, and survives red-green CVD, which a red/rose split does
 * not. Every outcome also receives a distinct texture below, so even the smallest segment remains
 * distinguishable without relying on colour alone.
 *
 * The lightness step has to hold in *both* themes, and the hue still needs room to read at an 8px
 * legend-dot size. `flagged` therefore darkens in dark mode instead of brightening. `killed` uses a
 * lighter orange in light mode and a darker orange in dark mode: on a single orange, Failed and
 * Killed sit only 0.009 apart in OKLab lightness, despite describing an application failure and an
 * operator kill. The theme-specific step separates that pair without moving Killed onto Warnings.
 */
export const outcomeSolid: Record<OutcomeSeriesKey, string> = {
	completed: toneSolid[telemetryOutcomePresentation.completed.tone],
	failed: toneSolid[telemetryOutcomePresentation.failed.tone],
	flagged: 'bg-red-900 dark:bg-red-700',
	killed: 'bg-orange-400 dark:bg-orange-700',
	noWork: 'bg-muted-foreground/55',
	running: toneSolid[telemetryOutcomePresentation.running.tone],
	stopped: toneSolid[telemetryOutcomePresentation.stopped.tone],
	warnings: toneSolid[telemetryOutcomePresentation.warnings.tone],
};

/**
 * A non-colour cue for every outcome in a stacked chart. Segments can be only four pixels tall,
 * so hue and lightness are insufficient; the same texture is repeated in legend markers.
 */
export const outcomePattern: Record<OutcomeSeriesKey, string> = {
	completed:
		'bg-[repeating-linear-gradient(0deg,transparent_0_3px,currentColor_3px_4px)] text-emerald-950/25 dark:text-emerald-100/25',
	failed: 'bg-[repeating-linear-gradient(45deg,transparent_0_2px,currentColor_2px_3px)] text-red-950/30 dark:text-red-100/30',
	flagged:
		'bg-[repeating-linear-gradient(-45deg,transparent_0_2px,currentColor_2px_3px)] text-red-100/30',
	killed: 'bg-[repeating-linear-gradient(90deg,transparent_0_3px,currentColor_3px_4px)] text-orange-950/30 dark:text-orange-100/30',
	noWork: 'bg-[repeating-linear-gradient(45deg,currentColor_0_2px,transparent_2px_5px)] text-background/35',
	running:
		'bg-[repeating-linear-gradient(135deg,transparent_0_3px,currentColor_3px_4px)] text-teal-950/25 dark:text-teal-100/25',
	stopped:
		'bg-[repeating-linear-gradient(90deg,transparent_0_1px,currentColor_1px_3px)] text-foreground/20',
	warnings:
		'bg-[repeating-linear-gradient(-45deg,transparent_0_3px,currentColor_3px_4px)] text-amber-950/25 dark:text-amber-100/25',
};

/** Group-hover fill matching `outcomeSolid`, for stacked segments that brighten on column hover. */
export const outcomeSolidHover: Record<OutcomeSeriesKey, string> = {
	completed: 'group-hover:bg-emerald-400 dark:group-hover:bg-emerald-500',
	failed: 'group-hover:bg-red-400 dark:group-hover:bg-red-400',
	flagged: 'group-hover:bg-red-800 dark:group-hover:bg-red-600',
	killed: 'group-hover:bg-orange-300 dark:group-hover:bg-orange-600',
	noWork: 'group-hover:opacity-80',
	running: 'group-hover:bg-teal-400 dark:group-hover:bg-teal-400',
	stopped: 'group-hover:opacity-80',
	warnings: 'group-hover:bg-amber-400 dark:group-hover:bg-amber-400',
};
