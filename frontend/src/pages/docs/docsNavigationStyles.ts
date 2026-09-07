import { linkFocusClass } from '../../lib/focusStyles.ts';

/**
 * Current-location styling for documentation-owned navigation.
 *
 * The shell rail owns the filled primary selection. Docs rails retain semantic current state and
 * the leading accent indicator without presenting another filled destination beside it.
 */
export const docsCurrentLocationClass = 'font-medium text-foreground';

/** One focus treatment for links that belong to documentation chrome rather than article prose. */
export const docsNavigationFocusClass = linkFocusClass;
