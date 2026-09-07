import type { ProjectImportCandidate } from '../../api/types/projects/operations.ts';

export type CandidateSignalFilter = 'aidd' | 'all' | 'directory' | 'git' | 'packageJson';

export interface CandidateFilters {
	query: string;
	root: string;
	signal: CandidateSignalFilter;
}

function matchesSignal(candidate: ProjectImportCandidate, signal: CandidateSignalFilter): boolean {
	if (signal === 'all') return true;
	if (signal === 'directory') {
		return !candidate.signals.aidd && !candidate.signals.git && !candidate.signals.packageJson;
	}
	return candidate.signals[signal];
}

export function filterImportCandidates(
	candidates: ProjectImportCandidate[],
	filters: CandidateFilters,
): ProjectImportCandidate[] {
	const query = filters.query.trim().toLocaleLowerCase();
	return candidates.filter((candidate) => {
		if (filters.root !== '' && candidate.root !== filters.root) return false;
		if (!matchesSignal(candidate, filters.signal)) return false;
		if (query === '') return true;
		return [candidate.name, candidate.path, candidate.root].some((value) =>
			value.toLocaleLowerCase().includes(query),
		);
	});
}

export function candidateRoots(candidates: ProjectImportCandidate[]): string[] {
	return [...new Set(candidates.map((candidate) => candidate.root))].sort((left, right) =>
		left.localeCompare(right),
	);
}
