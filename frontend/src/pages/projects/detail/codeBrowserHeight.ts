/**
 * The one height the code browser's two panes share, and the scroller that fills it.
 *
 * Both live here rather than beside either pane because the point of them is that neither pane
 * owns the number: the row takes its height from the viewport, and the tree and the viewer each
 * scroll inside their share of it, so their bottoms are the same line whatever is loaded.
 *
 * The subtracted `19rem` is the chrome above the row at the top of the project page — app header,
 * page header, tab bar, card header — measured rather than derived, which is why it is stated once
 * here and not repeated. Below `lg` the panes stack in page flow and neither the height nor the
 * scrollers apply: a nested scroller there swallows the wheel on the way past.
 */
export const codeBrowserHeightClass = 'lg:h-[calc(100vh-19rem)] lg:min-h-[28rem]';

/** Fills the shared height and scrolls its own overflow, from `lg` up. */
export const codeBrowserScrollerClass = 'lg:min-h-0 lg:flex-1';
