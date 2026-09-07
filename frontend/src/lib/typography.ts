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
 * The section-caption role projected through cmdk's owned group-heading element.
 *
 * Tailwind must see each prefixed utility literally, so `CommandGroup` cannot construct this from
 * `sectionCaptionClass` at runtime. Keeping the projection here still gives the role one named
 * source outside the component that consumes it; `command-caption.test.ts` holds the two
 * declarations in sync.
 */
export const commandGroupSectionCaptionClass =
	'[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase';

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
 * A definition term is a quiet label for the explanatory value that follows it.
 *
 * Weight distinguishes the term from running prose while muted colour leaves the definition as
 * the primary reading content. Authored case is preserved because terms can be literal values such
 * as `aidd-cli`; the general uppercase micro-label role is therefore deliberately not reused here.
 * The definition-list component owns the surrounding rhythm and foreground definition treatment.
 */
export const definitionTermClass = 'font-medium text-muted-foreground';

/**
 * An opt-in measure for compact fields whose realistic values do not justify a broad layout track.
 *
 * `FieldRow` deliberately owns no width: form grids need each field to fill the track they assign
 * it so controls in one column share a right edge. Apply this class at the call site only when the
 * field itself should stay narrower than that track, such as a short project-management value.
 */
export const compactFieldMeasureClass = 'max-w-[36rem]';

/**
 * The reading measure for rendered prose — roughly 68 characters, past which a line is hard to
 * return from.
 *
 * It belongs to the element that actually holds the prose, not to a card or column that also holds
 * structured content. Plain-copy callers apply this token to their paragraph. `MarkdownContent`
 * projects the same value onto its running-prose children so tables, code and definitions keep the
 * width their composition gives them.
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
 * The reading measure projected only onto running prose inside a structured document.
 *
 * Paragraphs, list items, quotations and definition descriptions retain the reading line while
 * definition-list structure, tables, code and headings take the track the document composition
 * gives them. `MarkdownContent` applies this projection itself so a caller cannot accidentally cap
 * its structured blocks or leave its prose uncapped.
 *
 * The definition selector names the component's real `dl > div > dd` shape. Projecting onto the
 * description rather than the `dl` preserves the full document track for terms and row structure.
 */
export const markdownRunningProseMeasureClass =
	'[&>blockquote]:max-w-[46ch] [&>dl>div>dd]:max-w-[46ch] [&>ol>li]:max-w-[46ch] [&>p]:max-w-[46ch] [&>ul>li]:max-w-[46ch]';

/**
 * The same measure for a container that *wraps* the prose rather than being it — a card with its
 * own padding — where `proseMeasureClass` lands wrong twice over.
 *
 * `ch` is the advance of `0` in the element's own face, and a card's face is the 16px body while
 * the prose inside it is `text-sm`. So the bare measure on the card caps at a size the reader is
 * not reading; `14/16` corrects it to the face that is actually set. Separately, `max-width` on a
 * `border-box` element includes padding, so the card's `p-4` would come out of the measure
 * allowance instead of sitting outside it — `2rem` puts it back, and the line the reader returns
 * from is the full 68 characters the docstring above promises.
 *
 * The base is `46ch` for the reason given above; the two corrections here are independent of it and
 * were already right. Arithmetic check at 2250x1309: 46 × 10.625px × 0.875 = 428px of content,
 * 428 / 6.293px per character = 68 characters.
 *
 * The shared Card owns `p-4` at every viewport, so the chrome term stays aligned with the component
 * rather than assuming a responsive padding branch the Card does not have.
 */
export const proseMeasureCardClass = 'max-w-[calc(46ch*0.875_+_2rem)]';

/**
 * The prose measure for a padded container that already establishes the `text-sm` face.
 *
 * Unlike `proseMeasureCardClass`, this needs no 14/16 face correction: the `ch` unit is already
 * measured at the size of the text being read. The remaining `2rem` keeps a shared Card's
 * horizontal padding outside the 46ch reading line.
 */
export const smallProseInsetMeasureClass = 'max-w-[calc(46ch+2rem)]';

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

/**
 * The mono editor measure for a Card that wraps a `font-mono text-xs` box — a textarea, or a
 * fenced code block through `MarkdownCodeBlock`. Both put a `p-3`/`px-3` box inside the Card's
 * `p-4`, so one constant covers them; the fenced case is 2px looser, being one border pair short of
 * the textarea's, which is a third of a character.
 *
 * Like `proseMeasureCardClass`, this converts the child's measure into the wrapping Card's face
 * before adding the chrome outside the line. At the app's declared sizes, one Geist Mono `ch` at
 * 12px is 7.2px while one Geist Sans `ch` on the 16px Card is 10.608px; `7.2 / 10.608` is
 * `0.678733`. The remaining width is the Card's horizontal `p-4` (2rem), the textarea's `px-3`
 * (1.5rem), and the four one-pixel borders around those two boxes. That leaves exactly 720px — 100
 * mono characters — in the textarea's content box instead of measuring the line in the Card's
 * proportional face.
 */
export const monoEditorMeasureCardClass = 'max-w-[calc(100ch*0.678733_+_3.5rem_+_4px)]';

/**
 * A machine-generated label contained by the track that owns it.
 *
 * Resource names, ids and audit keys can be one unbroken token hundreds of characters long. A
 * bare `truncate` does not constrain an inline element, and `min-width: auto` lets the token size a
 * grid or table track before truncation gets a chance to paint. The label therefore owns all three
 * parts of the contract: a block formatting box, a zero minimum contribution and a bounded width.
 * Callers that shorten the value must put its full text on that same element through `title`, a
 * link target, a disclosure or a copy control.
 */
export const machineLabelClass = 'block max-w-full min-w-0 truncate';

/**
 * A machine string whose complete text must remain visible in a wrapping region.
 *
 * Commands and paths can contain no whitespace or natural line-break opportunity. Prose wrapping
 * is intentionally insufficient for them: character-level breaking keeps every character inside
 * the container without shortening the value or creating an otherwise unexplained horizontal
 * axis.
 */
export const machineTextBreakClass = 'break-words [overflow-wrap:anywhere]';
