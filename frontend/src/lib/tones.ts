/**
 * Canonical semantic tone scale — the single source of truth for status coloring across the app.
 *
 * Semantic mapping: `emerald` = healthy/success, `amber` = needs attention, `red` = failure,
 * `teal` = informational/active, `violet` = system-managed, `neutral` = inert. Each tone has three
 * rendering shapes:
 *
 * - `toneText`  — foreground text/icon color (light + dark)
 * - `toneBadge` — subtle badge surface: background + text + inset ring (light + dark)
 * - `toneSurface` — subtle background only, for larger status regions
 * - `toneBorder` — status-aligned border color
 * - `toneSolid` — solid fill for dots, status pulses, and progress bars (theme-independent)
 *
 * Consumers (`Metric`, `Badge`, the run liveness dot, project/fleet health bands) import from here
 * instead of re-declaring literal Tailwind tone classes per file, so the convention is enforced in
 * one place rather than re-implemented in each component.
 */
export type Tone = 'amber' | 'emerald' | 'neutral' | 'red' | 'teal' | 'violet';

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
	teal: 'bg-accent-muted',
	violet: 'bg-violet-50 dark:bg-violet-950/40',
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
 */
export const invalidControlClass =
	'aria-invalid:border-red-500 aria-invalid:focus-visible:border-red-500 aria-invalid:focus-visible:ring-red-400/40 dark:aria-invalid:border-red-400 dark:aria-invalid:focus-visible:border-red-400';

/**
 * A destructive row action: quiet until hover.
 *
 * The Button `danger` variant is filled at rest, which is right for the one button that ends a form
 * and wrong for a delete repeated down a list — twelve filled red buttons read as twelve problems.
 * Recipe steps and recipe parameters both wanted this and both spelled it out by hand.
 */
export const dangerRowActionClass =
	'hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400';
