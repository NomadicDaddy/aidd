// The invalid state lives here rather than at each call site: controls that skinned it themselves
// drifted (RunLaunchCard's project select carried its own border, ring and dark-mode variants and
// rendered at a different radius from every other control in its row). The class itself now comes
// from `tones.ts`, which is where a red gets chosen.
import { invalidControlClass, toneText } from './tones.ts';

// Everything a control looks like, and nothing about how wide it is. The width used to be in here,
// and `cn()` cannot take it back out: `w-full` and `min-w-36` are different property groups, so both
// survive the merge. A flex item with only a min-width has `flex-basis: auto`, reads the `width` it
// was never meant to keep, resolves to the full 1278px row, and takes a line of its own — which is
// how the Runs filter row came to be four stacked selects instead of one toolbar.
const controlChromeClass = `h-9 min-w-0 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-ring/20 ${invalidControlClass}`;

/**
 * An `<input>`'s chrome, plus the width. A text input's intrinsic size is a browser default of about
 * twenty characters and is never the right answer, so filling its container is the sane base; where
 * it is a flex item the call site gives it a `flex-*` and the basis wins anyway.
 */
export const formControlClass = `w-full ${controlChromeClass}`;

/**
 * A `<select>`'s chrome. No width: a select's intrinsic size is its longest option, which is a
 * reasonable answer, and the container is the one that knows whether it wants more. Inside a grid
 * track or a `FieldRow` the control stretches without being told to; inside a flex toolbar it now
 * sits inline next to its neighbours.
 */
export const selectClass = controlChromeClass;

// The textarea carries the same invalid variant as every other control. `RecipeStepJsonField` built
// a second `errorTextareaClass` by hand because this one had no invalid state at all, and it picked
// a different focus ring than the inputs beside it.
export const textareaClass = `min-h-28 w-full min-w-0 resize-y rounded-lg border border-border bg-card px-3 py-2 text-sm leading-6 text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-ring/20 ${invalidControlClass}`;

export const fieldLabelClass = 'text-xs font-medium uppercase tracking-wide text-muted-foreground';

/**
 * The message under an invalid control. There were four spellings of this — `text-red-600` at
 * `text-xs`, the same with `font-medium`, `toneText.red` at `text-xs`, and one that added
 * `role="alert"` — for a sentence that always says the same kind of thing. `FieldRow` renders it
 * now, so most call sites pass a string and never name a colour at all.
 */
export const fieldErrorClass = `text-xs font-medium ${toneText.red}`;
