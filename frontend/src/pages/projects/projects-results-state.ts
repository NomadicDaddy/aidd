import type { ProjectSummary } from '../../api/types.ts';

// The results area has exactly one mode at a time. Modelling it as a discriminated union rather
// than a set of independent booleans keeps impossible combinations (loading AND no-match) out of
// the prop surface, and lets each variant carry only the data it actually renders. Lives in a
// plain .ts module so the resolver is directly unit-testable from the repo-root test suite, whose
// tsconfig does not enable --jsx.
export type ProjectsResultsState =
	| { allProjectsCount: number; type: 'no_match' }
	| { projects: ProjectSummary[]; type: 'ready' }
	| { type: 'loading' }
	| { type: 'no_discovered' }
	| { type: 'no_registered' };

export function resolveProjectsResultsState({
	allProjectsCount,
	isError,
	isLoading,
	skippedRootsCount,
	sorted,
}: {
	allProjectsCount: number;
	isError: boolean;
	isLoading: boolean;
	skippedRootsCount: number;
	sorted: ProjectSummary[];
}): ProjectsResultsState {
	if (isLoading) return { type: 'loading' };
	if (!isError && allProjectsCount === 0) {
		return { type: skippedRootsCount > 0 ? 'no_registered' : 'no_discovered' };
	}
	if (!isError && allProjectsCount > 0 && sorted.length === 0) {
		return { allProjectsCount, type: 'no_match' };
	}
	return { projects: sorted, type: 'ready' };
}
