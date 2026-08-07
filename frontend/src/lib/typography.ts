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

/**
 * The one uppercase micro-label style for a field name — the `<dt>` above a value inside a detail
 * panel, and the heading above a stat block.
 *
 * Distinct from `sectionCaptionClass` in weight and tracking: a field label sits inside a data
 * block and must stay quieter than the value it introduces, while a section caption heads a
 * navigation group. Colour is deliberately absent so an error field can carry its own tone.
 *
 * Distinct again from `fieldLabelClass` in lib/formStyles.ts, which labels an interactive form
 * control: that one is a full type step larger and carries its own colour, because it has to hold
 * its own against the input beneath it.
 *
 * The size is the named `text-2xs` step rather than the `text-[0.65rem]` each surface had invented
 * for itself, so the micro scale has exactly one declared value.
 */
export const microLabelClass = 'text-2xs font-medium tracking-wide uppercase';

/**
 * The reading measure for rendered prose — roughly 68 characters, past which a line is hard to
 * return from.
 *
 * It belongs to whatever *contains* the prose, not to `MarkdownContent` itself. When the renderer
 * carried it, a doc card stretched its border to the full column and drew it a second gutter away
 * from the last word of every line, so the card looked empty and the text looked unfinished. A
 * container that caps itself puts the border back against the prose.
 */
export const proseMeasureClass = 'max-w-[68ch]';

/**
 * The same measure for a container that *wraps* the prose rather than being it — a card with its
 * own padding — where `proseMeasureClass` lands wrong twice over.
 *
 * `ch` is the advance of `0` in the element's own face, and a card's face is the 16px body while
 * the prose inside it is `text-sm`. So `68ch` on the card caps at 68 characters of a size the
 * reader is not reading; `14/16` corrects it to the face that is actually set. Separately,
 * `max-width` on a `border-box` element includes padding, so the card's `p-7` was coming out of the
 * measure allowance instead of sitting outside it — `3.5rem` puts it back, and the line the reader
 * returns from is the full 68 the docstring above promises.
 *
 * Below `sm` the padding is `p-5` rather than `p-7`, which this does not model. It does not need
 * to: at those widths the column is a few hundred pixels and the cap is nowhere near binding.
 */
export const proseMeasureCardClass = 'max-w-[calc(68ch*0.875_+_3.5rem)]';
