// The invalid state lives here rather than at each call site: controls that skinned it themselves
// drifted (RunLaunchCard's project select carried its own border, ring and dark-mode variants and
// rendered at a different radius from every other control in its row).
const invalidControlClass =
	'aria-invalid:border-red-500 aria-invalid:focus-visible:ring-red-400/40 dark:aria-invalid:border-red-400';

export const formControlClass = `h-9 w-full min-w-0 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-ring/20 ${invalidControlClass}`;

export const selectClass = formControlClass;

export const textareaClass =
	'min-h-28 w-full min-w-0 resize-y rounded-lg border border-border bg-card px-3 py-2 text-sm leading-6 text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-ring/20';

export const fieldLabelClass = 'text-xs font-medium uppercase tracking-wide text-muted-foreground';
