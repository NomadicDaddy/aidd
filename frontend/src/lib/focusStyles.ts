/**
 * The visible keyboard-focus treatment for links and other text navigation.
 *
 * This restates the global `:focus-visible` rule so component-owned link classes can declare the
 * shared contract without adding a second ring or suppressing the outline.
 */
export const linkFocusClass =
	'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
