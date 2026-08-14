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
 *
 * The value is `46ch`, not `68ch`, and the difference is the whole point. The CSS `ch` unit is the
 * advance of `0`, which in Geist Sans is far wider than the average letter in running text:
 * measured in this app at 14px, `0` advances 9.297px while real prose from these pages averages
 * 6.293px per character — a ratio of 1.477. `68ch` therefore held **100 characters**, not 68, which
 * is past the point this cap exists to stay inside. `68 / 1.477` is 46.
 *
 * The ratio is size-independent, because both advances scale with `font-size`. So `46ch` yields 68
 * characters wherever it is applied, as long as it lands on the element that actually sets the
 * prose — which is why the card variant below has to exist at all.
 */
export const proseMeasureClass = 'max-w-[46ch]';

/**
 * The same measure for a container that *wraps* the prose rather than being it — a card with its
 * own padding — where `proseMeasureClass` lands wrong twice over.
 *
 * `ch` is the advance of `0` in the element's own face, and a card's face is the 16px body while
 * the prose inside it is `text-sm`. So the bare measure on the card caps at a size the reader is
 * not reading; `14/16` corrects it to the face that is actually set. Separately, `max-width` on a
 * `border-box` element includes padding, so the card's `p-7` was coming out of the measure
 * allowance instead of sitting outside it — `3.5rem` puts it back, and the line the reader returns
 * from is the full 68 characters the docstring above promises.
 *
 * The base is `46ch` for the reason given above; the two corrections here are independent of it and
 * were already right. Arithmetic check at 2250x1309: 46 × 10.625px × 0.875 = 428px of content,
 * 428 / 6.293px per character = 68 characters.
 *
 * Below `sm` the padding is `p-5` rather than `p-7`, which this does not model. It does not need
 * to: at those widths the column is a few hundred pixels and the cap is nowhere near binding.
 */
export const proseMeasureCardClass = 'max-w-[calc(46ch*0.875_+_3.5rem)]';

/**
 * The measure for a monospace editing surface — a notes pad, a spec field — where the reading
 * measure above would be wrong in both directions.
 *
 * Wrong on the number, because writing tolerates a longer line than reading and the author is
 * looking at the line they are typing rather than returning to the start of the next one. Wrong on
 * the unit correction, too: in a monospace face `ch` *is* the character advance, so no ratio applies
 * and `100ch` is exactly 100 characters — the conventional code width, and the width the markdown
 * these pads hold is usually already wrapped to.
 *
 * The alternative was leaving them at `w-full`, which on a 2250px screen gave the Notes pad a
 * ~220-character line.
 */
export const monoEditorMeasureClass = 'max-w-[100ch]';

/** The monospace editor measure plus a Card's horizontal `p-4`, applied to the Card itself. */
export const monoEditorMeasureCardClass = 'max-w-[calc(100ch_+_2rem)]';
