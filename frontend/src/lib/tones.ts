/**
 * Canonical semantic tone scale — the single source of truth for status coloring across the app.
 *
 * Semantic mapping: `emerald` = healthy/success, `amber` = needs attention, `red` = failure,
 * `cyan` = informational/active, `neutral` = inert. Each tone has three rendering shapes:
 *
 * - `toneText`  — foreground text/icon color (light + dark)
 * - `toneBadge` — subtle badge surface: background + text + inset ring (light + dark)
 * - `toneSolid` — solid fill for dots, status pulses, and progress bars (theme-independent)
 *
 * Consumers (`Metric`, `Badge`, the run liveness dot, project/fleet health bands) import from here
 * instead of re-declaring literal Tailwind tone classes per file, so the convention is enforced in
 * one place rather than re-implemented in each component.
 */
export type Tone = 'amber' | 'cyan' | 'emerald' | 'neutral' | 'red';

/** Foreground text/icon color for a tone (light + dark). */
export const toneText: Record<Tone, string> = {
	amber: 'text-amber-600 dark:text-amber-300',
	cyan: 'text-cyan-700 dark:text-cyan-300',
	emerald: 'text-emerald-700 dark:text-emerald-300',
	neutral: 'text-neutral-600 dark:text-neutral-300',
	red: 'text-red-700 dark:text-red-300',
};

/** Subtle badge surface: background + text + inset ring (light + dark). */
export const toneBadge: Record<Tone, string> = {
	amber: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900',
	cyan: 'bg-cyan-50 text-cyan-800 ring-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:ring-cyan-900',
	emerald:
		'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900',
	neutral: 'bg-muted text-foreground ring-border',
	red: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900',
};

/** Solid fill for dots, status pulses, and progress bars (theme-independent). */
export const toneSolid: Record<Tone, string> = {
	amber: 'bg-amber-500',
	cyan: 'bg-cyan-500',
	emerald: 'bg-emerald-500',
	neutral: 'bg-neutral-400',
	red: 'bg-red-500',
};
