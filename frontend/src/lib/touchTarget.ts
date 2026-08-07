/**
 * The 44px touch floor, for the things the `Button` scale cannot reach.
 *
 * Every shared control size grows to at least `min-h-11` below `sm` and restores its current height
 * from `sm` up — the shape `SidebarNav` has always used (`h-11 w-11 … sm:h-9 sm:w-auto`). That
 * covers anything rendered as a `Button`, an `Input` or a `Select`. It cannot cover a link, a bare
 * `<button>` styled as text, or a 16px checkbox, because none of them has a height to raise: the
 * box is the glyph. Those need their hit area grown around the glyph instead, which is what these
 * two do — padding out to 44px and an equal negative margin pulling the layout back, so the target
 * grows and nothing moves.
 *
 * All three are `max-sm:` only. From the tablet breakpoint up a pointer is precise and the negative
 * margins would be paying a real cost — overlapping rows in a dense table — for nothing.
 *
 * WHICH ONE TO REACH FOR. The two expanding idioms buy their target back out of the space above and
 * below, so they are only safe where that space belongs to nobody: an isolated link on a card
 * header row, a breadcrumb, a lone value in a definition list. Used on a row in a stacked list they
 * do real damage — a 20px row on an 8px gap grows a 44px hit box that reaches 12px into the row
 * above, and the taps that land there go to the wrong row. That case wants `touchTargetRowClass`,
 * which raises the row instead of borrowing from its neighbours. A list that is a touch surface
 * should be taller on a phone; that is the correct outcome, not a cost.
 */

/**
 * Interactive text: a row link, or a `<button>` that looks like one. 20px of line box plus 12px
 * above and below is 44.
 *
 * `max-sm:leading-5` is what makes that arithmetic true rather than aspirational. The padding is
 * fixed but the line box is not: at `text-xs` it is 16px, so the same class produced a 40px target
 * on the two `ExecutionRowLinks` the floor feature migrated — measured, not inferred. Pinning the
 * line box below `sm` makes the total 44 for every type size the class is used at, and the negative
 * margin still cancels the padding, so nothing moves in flow.
 */
export const touchTargetTextClass =
	'inline-block max-sm:-my-3 max-sm:py-3 max-sm:leading-5 sm:-my-1.5 sm:py-1.5';

/**
 * A small square control that is its own target — a checkbox with no `<label>` around it. 16px plus
 * 14px on each side is 44. Where a checkbox does sit inside a `<label>`, the label is already the
 * target and is already large enough; do not add this there.
 *
 * PUT THIS ON A WRAPPING `<label>`, NEVER ON THE `<input>` ITSELF. Chrome renders a native
 * `appearance: auto` checkbox as a replaced element and drops its padding: applied to the input,
 * `max-sm:p-3.5` computes to `padding: 0px` while `max-sm:-m-3.5` still applies, so the target
 * stayed 16x16 and the box was pulled 14px into its neighbours — measurably worse than leaving it
 * alone. On a `<label>` the padding is honoured, and a click anywhere in the padded box toggles the
 * input for free.
 */
export const touchTargetBoxClass = 'inline-flex max-sm:-m-3.5 max-sm:p-3.5';

/**
 * A row in a stacked list — a file tree node, a nav item, an inventory row, a checkbox and its
 * label. The row already spans its container, so it has no lateral neighbour to displace and the
 * only thing missing is height. Raise it and centre what is inside; no negative margin, because
 * this is the case where borrowing the space above would collide with the row above.
 *
 * `flex` is part of the idiom rather than left to the call site: `min-h-11` alone leaves the
 * content sitting on its natural baseline at the top of a 44px box, which reads as a 44px row with
 * a 24px hole under the text.
 */
export const touchTargetRowClass = 'max-sm:flex max-sm:min-h-11 max-sm:items-center';
