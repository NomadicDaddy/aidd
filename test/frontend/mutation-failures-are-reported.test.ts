import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Actions that used to fail with nothing on screen: the button re-enabled and the operator was
 * left to guess. Each one now reports, either in its hook (when no caller reported anything) or
 * at its silent call site (when other callers of the same hook already report in their own words,
 * and a hook-level toast would have shown the same failure twice).
 *
 * This pins those sites, not every mutation in the panel. 52 of 57 useMutation calls declare no
 * onError in the hook, and most of their callers do handle it; a rule over all of them needs a
 * call-site resolver this file does not have, and is tracked as its own remediation.
 */
const read = (path: string): string =>
	readFileSync(resolve(process.cwd(), 'frontend', 'src', path), 'utf8');

/** The options object of `name: useMutation({ ... })`, by brace matching. */
function hookOptions(source: string, name: string): string {
	const start = source.indexOf(`${name}: useMutation(`);
	if (start < 0) throw new Error(`${name}: useMutation( not found`);
	const open = source.indexOf('{', start);
	let depth = 0;
	for (let index = open; index < source.length; index += 1) {
		if (source[index] === '{') depth += 1;
		else if (source[index] === '}' && --depth === 0) return source.slice(open, index + 1);
	}
	throw new Error(`${name}: unbalanced options`);
}

/** The text of the `.mutate(` call that follows `marker`, up to its closing parenthesis. */
function mutateCall(source: string, marker: string): string {
	const start = source.indexOf(marker);
	if (start < 0) throw new Error(`${marker} not found`);
	let depth = 0;
	const open = source.indexOf('(', start + marker.length - 1);
	for (let index = open; index < source.length; index += 1) {
		if (source[index] === '(') depth += 1;
		else if (source[index] === ')' && --depth === 0) return source.slice(start, index + 1);
	}
	throw new Error(`${marker}: unbalanced call`);
}

describe('mutation failures are reported', () => {
	test.each([
		['hooks/useRecipes.ts', 'deleteRecipe'],
		['hooks/useRecipes.ts', 'reloadRecipe'],
		['hooks/useRecipes.ts', 'reloadRecipes'],
		['hooks/useRecipes.ts', 'saveRecipe'],
		['hooks/useRuns.ts', 'kill'],
		['hooks/useRuns.ts', 'stop'],
	])('%s %s reports in the hook', (file, name) => {
		expect(hookOptions(read(file), name)).toMatch(/\bonError\b/);
	});

	test('stopping a run still rolls back the optimistic "Stopping…" when it fails', () => {
		expect(hookOptions(read('hooks/useRuns.ts'), 'stop')).toContain('clearStopRequested(id)');
	});

	test.each([
		['pages/dashboard/WaitingApprovalRows.tsx', 'launchSuggestion.mutate('],
		['pages/dashboard/WaitingApprovalRows.tsx', 'dismissSuggestion.mutate('],
		['pages/dashboard/WaitingApprovalRows.tsx', 'approveMutation.mutate('],
		['pages/dashboard/WaitingApprovalRows.tsx', 'dismissMutation.mutate('],
		['pages/recipes/RecipesPage.tsx', 'recipes.launchRecipe.mutate('],
		['pages/runs/useRunsPage.ts', 'pipelineSessions.stopSession.mutate('],
	])('%s %s reports at the call site', (file, marker) => {
		expect(mutateCall(read(file), marker)).toMatch(/\bonError\b/);
	});

	test('a failed recipe delete leaves its confirmation open', () => {
		expect(
			mutateCall(read('pages/recipes/RecipeDetailPage.tsx'), 'recipes.deleteRecipe.mutate('),
		).not.toContain('onSettled');
	});
});
