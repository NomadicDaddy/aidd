/**
 * The one prerequisite every Launch button on the catalog shares.
 *
 * It lives in a module rather than beside the buttons because two files state it: the button's
 * `title`, and the notice above the results that `aria-describedby` points at. A `.tsx` that exports
 * both a component and a constant is a `react-refresh/only-export-components` error at
 * `--max-warnings 0`, so the string cannot live in RecipeGrid.tsx.
 */
export const launchHint = 'Choose a project to enable Launch';
