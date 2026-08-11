/**
 * The one height the code browser's two panes share, and the scroller that fills it.
 *
 * Both live here rather than beside either pane because the point of them is that neither pane
 * owns the number: the row takes its height from the viewport, and the tree and the viewer each
 * scroll inside their share of it, so their bottoms are the same line whatever is loaded.
 *
 * The subtracted `19rem` is the chrome above the row at the top of the project page — app header,
 * page header, tab bar, card header — measured rather than derived, which is why it is stated once
 * here and not repeated. Below the split the panes stack in page flow and neither the height nor
 * the scrollers apply: a nested scroller there swallows the wheel on the way past.
 *
 * The gate is the card's own width, not the viewport's. `lg` is 1024px of window, but the card sits
 * inside the content column, and with the rail expanded that column is about 992px at a 1024
 * viewport — so the browser split into two columns roughly 32px before it had the width for them,
 * and collapsed back to one the moment the rail was collapsed at the same viewport. `61rem` (976px)
 * is measured on the card: a 17rem tree plus a viewer with a usable measure left over.
 *
 * The height stays a `100vh` calculation because it is a height, and the window is what bounds it.
 * Only the tier that turns it on moved.
 */
export const codeBrowserHeightClass =
	'@min-[61rem]:h-[calc(100vh-19rem)] @min-[61rem]:min-h-[28rem]';

/** Fills the shared height and scrolls its own overflow, once the card is wide enough to split. */
export const codeBrowserScrollerClass = '@min-[61rem]:min-h-0 @min-[61rem]:flex-1';
