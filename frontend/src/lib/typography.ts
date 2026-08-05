/**
 * The one uppercase caption style for group and section labels.
 *
 * The shell's nav groups, the command palette's group headings and the shortcuts overlay's section
 * headings are the same thing seen on three surfaces, and each had drifted to its own size
 * (`text-[0.65rem]`) and tracking. Importing this string is what keeps them identical; the command
 * palette styles its headings through a `[&_[cmdk-group-heading]]:` variant of the same utilities,
 * because Tailwind only emits classes it can read literally in the source.
 */
export const sectionCaptionClass =
	'text-xs font-semibold tracking-wider text-muted-foreground uppercase';
