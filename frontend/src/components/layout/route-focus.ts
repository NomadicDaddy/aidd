/** The navigation kinds react-router reports, named as it names them. */
export type RouteNavigationType = 'POP' | 'PUSH' | 'REPLACE';

/**
 * Whether a navigation should move focus to the `<main id="main-content">` landmark.
 *
 * Focusing the landmark scrolls it into view, so this is not only an assistive-technology question:
 * every `true` here moves the viewport. A navigation that is not a landing must answer `false`, or
 * the operator arrives at a scroll position they did not ask for — under the sticky top bar, with
 * the page's own heading hidden above it, which is what a narrow viewport makes obvious.
 *
 * `previousPathname` is null on the first render only.
 */
export function shouldFocusMainOnNavigation({
	navigationType,
	nextPathname,
	previousPathname,
}: {
	navigationType: RouteNavigationType;
	nextPathname: string;
	previousPathname: null | string;
}): boolean {
	// A deep link keeps the browser's natural initial focus; nothing has moved yet.
	if (previousPathname === null) return false;
	// Only the query string moved: a tab or filter change on the page already being read. Yanking
	// focus out of the control that was just operated is the opposite of helpful.
	if (previousPathname === nextPathname) return false;
	// Every redirect stub arrives as a REPLACE — `/pipeline-sessions` and `/docs` render
	// `<Navigate replace>`, and the canonical-project-route rewrite is the same shape. Their target
	// is the second half of one landing, not a navigation the operator made, so it inherits the
	// first-render answer rather than the first render consuming the guard on the stub's behalf.
	if (navigationType === 'REPLACE') return false;
	return true;
}
