import type { WebRunOutcomeTone } from 'aidd-shared/runs/outcome';

/**
 * Canonical semantic tone scale — the single source of truth for status coloring across the app.
 *
 * Each tone makes one assertion everywhere it appears:
 *
 * - `neutral` = no status assertion: identity, taxonomy, ordinary counts, and inert state
 * - `teal` = active or informational state
 * - `violet` = system-managed state
 * - `emerald` = healthy or successful state
 * - `amber` = actionable attention backed by an explicit state or named band/threshold
 * - `red` = failure or error state
 *
 * A raw non-zero count never establishes the band required for `amber`. Consumers must receive an
 * explicit state or named band/threshold from their domain instead of inventing severity from the
 * presence of data. The scale exposes these rendering shapes:
 *
 * - `toneText`  — foreground text/icon color (light + dark)
 * - `toneBadge` — subtle badge surface: background + text + inset ring (light + dark)
 * - `toneSurface` — subtle background only, for larger status regions
 * - `toneBorder` — status-aligned border color
 * - `toneSolid` — solid fill for dots, status pulses, and progress bars (theme-independent)
 * - `toneStroke` — SVG stroke color for status graphics
 * - `dangerButtonClass` — solid destructive commit control, distinct from subtle red regions
 *
 * Consumers (`Metric`, `Badge`, the run liveness dot, project/fleet health bands) import from here
 * instead of re-declaring literal Tailwind tone classes per file, so the convention is enforced in
 * one place rather than re-implemented in each component.
 */
export type Tone = 'violet' | WebRunOutcomeTone;

/** Foreground text/icon color for a tone (light + dark). */
export const toneText: Record<Tone, string> = {
	amber: 'text-amber-600 dark:text-amber-300',
	emerald: 'text-emerald-700 dark:text-emerald-300',
	neutral: 'text-muted-foreground',
	red: 'text-red-700 dark:text-red-300',
	teal: 'text-teal-700 dark:text-teal-300',
	violet: 'text-violet-700 dark:text-violet-300',
};

/**
 * The tone's foreground color applied on hover, for a control that is neutral at rest — a table
 * row link that only reveals its destination under the cursor. Declared here rather than spelled
 * out per call site because a tone consumed only by hand-written hover strings is not a source of
 * truth: the next change to what "informational" means would miss every one of them.
 */
export const toneTextHover: Record<Tone, string> = {
	amber: 'hover:text-amber-600 dark:hover:text-amber-300',
	emerald: 'hover:text-emerald-700 dark:hover:text-emerald-300',
	neutral: 'hover:text-muted-foreground',
	red: 'hover:text-red-700 dark:hover:text-red-300',
	teal: 'hover:text-teal-700 dark:hover:text-teal-300',
	violet: 'hover:text-violet-700 dark:hover:text-violet-300',
};

/**
 * One step further along the tone on hover, for a control that already carries `toneText` at rest.
 * Distinct from `toneTextHover` because the two answer different questions: this one deepens a
 * color that is already there, that one introduces a color that is not.
 */
export const toneTextHoverStrong: Record<Tone, string> = {
	amber: 'hover:text-amber-800 dark:hover:text-amber-100',
	emerald: 'hover:text-emerald-900 dark:hover:text-emerald-100',
	neutral: 'hover:text-foreground',
	red: 'hover:text-red-900 dark:hover:text-red-100',
	teal: 'hover:text-teal-900 dark:hover:text-teal-100',
	violet: 'hover:text-violet-900 dark:hover:text-violet-100',
};

/** Subtle badge surface: background + text + inset ring (light + dark). */
export const toneBadge: Record<Tone, string> = {
	amber: 'bg-amber-50 text-amber-800 ring-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/50',
	emerald:
		'bg-emerald-50 text-emerald-800 ring-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50',
	neutral: 'bg-muted text-foreground ring-border',
	red: 'bg-red-50 text-red-700 ring-red-200/70 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-800/50',
	teal: 'bg-teal-50 text-teal-800 ring-teal-200/70 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-800/50',
	violet: 'bg-violet-50 text-violet-800 ring-violet-200/70 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800/50',
};

/** Subtle background only, for larger status regions that compose their own text and border. */
export const toneSurface: Record<Tone, string> = {
	amber: 'bg-amber-50 dark:bg-amber-950/40',
	emerald: 'bg-emerald-50 dark:bg-emerald-950/40',
	neutral: 'bg-muted',
	red: 'bg-red-50 dark:bg-red-950/40',
	teal: 'bg-teal-50 dark:bg-teal-950/40',
	violet: 'bg-violet-50 dark:bg-violet-950/40',
};

/** Tone-aligned background introduced on pointer hover without coloring the resting surface. */
export const toneSurfaceHover: Record<Tone, string> = {
	amber: 'hover:bg-amber-50 dark:hover:bg-amber-950/40',
	emerald: 'hover:bg-emerald-50 dark:hover:bg-emerald-950/40',
	neutral: 'hover:bg-muted',
	red: 'hover:bg-red-50 dark:hover:bg-red-950/40',
	teal: 'hover:bg-teal-50 dark:hover:bg-teal-950/40',
	violet: 'hover:bg-violet-50 dark:hover:bg-violet-950/40',
};

/** Tone-aligned background introduced by keyboard or roving-menu focus. */
export const toneSurfaceFocus: Record<Tone, string> = {
	amber: 'focus:bg-amber-50 dark:focus:bg-amber-950/40',
	emerald: 'focus:bg-emerald-50 dark:focus:bg-emerald-950/40',
	neutral: 'focus:bg-muted',
	red: 'focus:bg-red-50 dark:focus:bg-red-950/40',
	teal: 'focus:bg-teal-50 dark:focus:bg-teal-950/40',
	violet: 'focus:bg-violet-50 dark:focus:bg-violet-950/40',
};

/** Status-aligned border color for larger regions. */
export const toneBorder: Record<Tone, string> = {
	amber: 'border-amber-300 dark:border-amber-700/60',
	emerald: 'border-emerald-300 dark:border-emerald-700/60',
	neutral: 'border-border',
	red: 'border-red-200 dark:border-red-900/60',
	teal: 'border-accent/30',
	violet: 'border-violet-300 dark:border-violet-700/60',
};

/** Solid fill for dots, status pulses, and progress bars (theme-independent). */
export const toneSolid: Record<Tone, string> = {
	amber: 'bg-amber-500',
	emerald: 'bg-emerald-500',
	neutral: 'bg-muted-foreground',
	red: 'bg-red-500',
	teal: 'bg-teal-500',
	violet: 'bg-violet-500',
};

/** SVG stroke color for status graphics such as segmented maturity rings. */
export const toneStroke: Record<Tone, string> = {
	amber: 'stroke-amber-500',
	emerald: 'stroke-emerald-500',
	neutral: 'stroke-muted-foreground',
	red: 'stroke-red-500',
	teal: 'stroke-teal-500',
	violet: 'stroke-violet-500',
};

/** Search-result mark that stays legible inside the dark live-console surface. */
export const consoleSearchMatchClass =
	'bg-amber-300 text-neutral-900 underline decoration-current decoration-2 underline-offset-2';

/**
 * The invalid-control treatment. Declared here with the rest of the reds because this file is the
 * single place a red gets chosen, and `border-red-500` is not one of the shapes above:
 * `toneBorder.red` is a region edge — a 200-weight tint meant to sit under content — and a control
 * the operator has to go back and fix needs a line visible at 1px against `bg-card`.
 *
 * `aria-invalid:focus-visible:border-red-500` is not redundant with the unfocused rule. Controls
 * carry `focus-visible:border-accent/60`, which has the same specificity as the plain `aria-invalid`
 * variant, so the later-generated one won and the field turned teal the moment the operator clicked
 * into it — the error disappeared exactly when they went to correct it. Pairing the two variants
 * takes the specificity past it, and an invalid control now holds one border colour either way.
 * The invalid focus ring grows from two to three pixels, which is what keeps the state distinct
 * without relying on colour. Its colour is theme-split for the same reason `--ring` is: one red at
 * one alpha cannot clear the 3:1 non-text floor on both a white card and a #161a22 one. red-400/60
 * measured 1.84:1 on the light card — below the floor on the controls that most need a visible
 * focus. red-600/80 measures 3.78 there, red-400/80 measures 4.47 on the dark card, and the two are
 * split by variant rather than compromised into one value that fails somewhere.
 */
export const invalidControlClass =
	'aria-invalid:border-red-500 aria-invalid:focus-visible:border-red-500 aria-invalid:focus-visible:ring-3 aria-invalid:focus-visible:ring-red-600/80 dark:aria-invalid:border-red-400 dark:aria-invalid:focus-visible:border-red-400 dark:aria-invalid:focus-visible:ring-red-400/80';

/**
 * A destructive row action: red at rest without becoming a filled danger button.
 *
 * The Button `danger` variant is filled at rest, which is right for the one button that ends a form
 * and wrong for a delete repeated down a list — twelve filled red buttons read as twelve problems.
 * Recipe steps and recipe parameters both wanted this and both spelled it out by hand. Keeping the
 * surface transparent preserves the density distinction while the resting icon/text color makes
 * the consequence legible to touch users who have no hover preview.
 */
export const dangerRowActionClass =
	'danger-row-action [--danger-row-active:var(--color-red-100)] text-red-600 hover:bg-red-50 hover:text-red-600 dark:[--danger-row-active:var(--color-red-950)] dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-400';

/**
 * A destructive commit control, distinct from the subtle red regions above.
 *
 * `toneSurface.red` and `toneBorder.red` intentionally make quiet status regions. A Button that
 * composed those same tokens was nearly indistinguishable from a Card, and disappeared further
 * when a red escalation Card used the identical pair. This solid treatment keeps the semantic red
 * identity while giving the control its own boundary and a real pointer-hover step.
 */
export const dangerButtonClass =
	'border-red-800 bg-red-700 text-white shadow-sm shadow-red-950/15 hover:border-red-700 hover:bg-red-600 dark:border-red-400 dark:shadow-red-950/30 dark:hover:border-red-300';

/** Preserve the danger Button's resting chrome when the whole control is blocked and dimmed. */
export const blockedDangerButtonHoverClass =
	'hover:border-red-800 hover:bg-red-700 dark:hover:border-red-400';
