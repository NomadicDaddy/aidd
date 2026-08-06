/**
 * The 44px touch floor, for the two things the `Button` scale cannot reach.
 *
 * Every shared control size grows to at least `min-h-11` below `sm` and restores its current height
 * from `sm` up — the shape `SidebarNav` has always used (`h-11 w-11 … sm:h-9 sm:w-auto`). That
 * covers anything rendered as a `Button`, an `Input` or a `Select`. It cannot cover a link, a bare
 * `<button>` styled as text, or a 16px checkbox, because none of them has a height to raise: the
 * box is the glyph. Those need their hit area grown around the glyph instead, which is what these
 * two do — padding out to 44px and an equal negative margin pulling the layout back, so the target
 * grows and nothing moves.
 *
 * Both are `max-sm:` only. From the tablet breakpoint up a pointer is precise and the negative
 * margins would be paying a real cost — overlapping rows in a dense table — for nothing.
 */

/**
 * Interactive text: a row link, or a `<button>` that looks like one. 20px of line box plus 12px
 * above and below is 44.
 */
export const touchTargetTextClass = 'inline-block max-sm:-my-3 max-sm:py-3 sm:-my-1.5 sm:py-1.5';

/**
 * A small square control that is its own target — a checkbox with no `<label>` around it. 16px plus
 * 14px on each side is 44. Where a checkbox does sit inside a `<label>`, the label is already the
 * target and is already large enough; do not add this there.
 */
export const touchTargetBoxClass = 'max-sm:-m-3.5 max-sm:p-3.5';
