// The invalid state lives here rather than at each call site: controls that skinned it themselves
// drifted (RunLaunchCard's project select carried its own border, ring and dark-mode variants and
// rendered at a different radius from every other control in its row). The class itself now comes
// from `tones.ts`, which is where a red gets chosen.
import { invalidControlClass, toneText } from './tones.ts';

export const formControlClass = `h-9 w-full min-w-0 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-ring/20 ${invalidControlClass}`;

export const selectClass = formControlClass;

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
