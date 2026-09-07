// The invalid state lives here rather than at each call site: controls that skinned it themselves
// drifted (RunLaunchCard's project select carried its own border, ring and dark-mode variants and
// rendered at a different radius from every other control in its row). The class itself now comes
// from `tones.ts`, which is where a red gets chosen.
import { cn } from './cn.ts';
import { invalidControlClass, toneText } from './tones.ts';
import { monoEditorMeasureClass, proseMeasureClass } from './typography.ts';

const disabledControlClass =
	'disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-60 disabled:placeholder:text-muted-foreground/70';

/**
 * The keyboard-focus boundary shared by form controls and control-like table interactions.
 *
 * This block used to claim the half-strength ring cleared the non-text contrast floor on the card
 * surface. It did not, and could not: a colour at 50% over white tops out at 3.95:1 even when the
 * colour is pure black, so the whole gamut holds about one point of headroom over the 3:1 floor
 * and no recognisable accent is anywhere near it. The light ring measured 1.58:1 there.
 *
 * So the alpha carries the softening it can afford and no more. At /80 the ring measures 3.73:1 on
 * --card, 3.49 on --background and 3.42 on --muted in the light theme, and 6.41 / 6.90 / 5.91 in
 * the dark one. The companion accent border still keeps the boundary legible wherever a transparent
 * resting border is appropriate; it is a companion, and the ring is the indicator that has to clear
 * the floor on its own.
 *
 * test/frontend/focus-ring-contrast.test.ts recomputes all of that from the tokens, so the numbers
 * above are checked rather than remembered.
 */
export const controlFocusClass =
	'focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-ring/80';

/**
 * Disabled state for a field-sized interactive surface rather than for the control inside it.
 *
 * `FieldCheckbox` owns a bordered row, so dimming only its 16px native input leaves the much larger
 * hit target looking enabled. The row uses the same cursor, border, and surface vocabulary as the
 * canonical controls while keeping its explanatory text above the contrast floor.
 */
export const disabledFieldSurfaceClass =
	'cursor-not-allowed border-border bg-muted text-muted-foreground';

// Everything a control looks like, and nothing about how wide it is. A width in here cannot be
// taken back out by `cn()`: `w-full` and `min-w-36` are different property groups, so both survive
// the merge. A flex item with only a min-width has `flex-basis: auto`, reads the `width` it was
// never meant to keep, resolves to the full 1278px row, and takes a line of its own — which would
// turn the Runs filter row into four stacked selects instead of one toolbar.
// The height is the same 44px-below-`sm` floor the `Button` scale carries, spelled the same way: a
// `min-h-*` that lets a control grow, handed back to `sm:h-9` from the tablet breakpoint up so the
// desk layout is unchanged. A 36px select is a 36px tap target, and this string is every input and
// every select in the app.
const controlChromeClass = `min-h-11 min-w-0 rounded-lg sm:h-9 sm:min-h-0 border border-control-border bg-card px-3 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground ${controlFocusClass} ${disabledControlClass} ${invalidControlClass}`;

/**
 * An `<input>`'s chrome, plus the width. A text input's intrinsic size is a browser default of about
 * twenty characters and is never the right answer, so filling its container is the sane base; where
 * it is a flex item the call site gives it a `flex-*` and the basis wins anyway.
 */
export const formControlClass = `w-full ${controlChromeClass}`;

/**
 * A `<select>`'s chrome. No width: a select's intrinsic size is its longest option, which is a
 * reasonable answer, and the container is the one that knows whether it wants more. Inside a grid
 * track or a `FieldRow` the control stretches without being told to; inside a flex toolbar it
 * sits inline next to its neighbours.
 */
export const selectClass = controlChromeClass;

/**
 * A repeated select keeps a quiet border and muted resting surface, then strengthens both when its
 * row is hovered or the control receives focus. The full control boundary remains available for
 * standalone fields through `selectClass`; this quieter shape identifies editable table cells
 * without turning dense tables into a grid of control-strength outlines.
 */
export const quietSelectClass = `min-h-11 min-w-0 rounded-lg border border-border bg-muted px-3 text-sm text-foreground outline-none transition-colors duration-150 sm:h-9 sm:min-h-0 group-hover/quiet:border-control-border group-hover/quiet:bg-card focus:border-control-border focus:bg-card ${controlFocusClass} ${disabledControlClass} ${invalidControlClass}`;

// Free prose is the safe default for a textarea: without a measure, Director behavior instructions
// stretched past 130 characters per line. Machine editors opt into the 100ch variant below.
export const textareaClass = `min-h-28 w-full min-w-0 resize-y rounded-lg border border-control-border bg-card px-3 py-2 text-sm leading-6 text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground ${proseMeasureClass} ${controlFocusClass} ${disabledControlClass} ${invalidControlClass}`;

/** A canonical textarea whose authored content is structured monospace text. */
export const monoTextareaClass = cn(textareaClass, monoEditorMeasureClass);

export const fieldLabelClass = 'text-xs font-medium uppercase tracking-wide text-muted-foreground';

/**
 * The accessible-description track under a field. Its outer box remains as wide as the control so
 * the field keeps one edge; `FieldRow` constrains only the prose nested inside this track.
 */
export const fieldHintClass = 'grid w-full gap-1 text-xs text-muted-foreground';

/**
 * Where a settings form grid stops widening.
 *
 * The column count is already the terminal step — `@min-[61rem]:grid-cols-3` and nothing above it —
 * but a three-column grid in a 1962px content column is three 640px tracks, and a field that spans
 * all three is 1928px of input for a repository URL. The grid needs a width to stop at as well as a
 * column count to stop at; without one the two settings that read as the app's reference form were
 * the two worst-proportioned things on a 2250-wide screen.
 *
 * 90rem is the widest step in this codebase, so a wide screen shows three comfortable columns and
 * the surplus goes back to the page rather than into the controls.
 */
export const formGridMeasureClass = 'max-w-[80rem]';

/**
 * A field-owning grid always carries its measure with it. Sections may add responsive columns or
 * override the gap, but they cannot create an unbounded shared form grid by omitting a second class.
 */
export const formGridClass = `grid gap-3 ${formGridMeasureClass}`;

/**
 * The message under an invalid control had four local combinations of size, weight, color, and
 * alert semantics. `FieldRow` renders the shared form now, so most call sites pass a string and
 * never name a colour at all.
 */
export const fieldErrorClass = `text-xs font-medium ${toneText.red}`;
