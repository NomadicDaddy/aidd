import type { ProfileMatrixRowModel } from './profileMatrixTypes.ts';

export type PostureFilter = 'all' | 'full' | 'standard';
export type SourceFilter = 'all' | 'explicit' | 'inferred';

export interface ProfileMatrixFilterState {
	dirtyOnly: boolean;
	posture: PostureFilter;
	query: string;
	source: SourceFilter;
}

export const emptyMatrixFilters: ProfileMatrixFilterState = {
	dirtyOnly: false,
	posture: 'all',
	query: '',
	source: 'all',
};

/**
 * Presentation-layer filtering over the already-computed rows: name/path, where the profile came
 * from, what posture it produces, and whether it is unsaved. Every value is on the row model, so
 * this needs no extra request.
 */
export function filterMatrixRows(
	rows: ProfileMatrixRowModel[],
	filters: ProfileMatrixFilterState,
): ProfileMatrixRowModel[] {
	const needle = filters.query.trim().toLowerCase();
	return rows.filter((row) => {
		if (filters.dirtyOnly && !row.dirty) return false;
		if (filters.source !== 'all' && row.project.metadata.profile.source !== filters.source) {
			return false;
		}
		if (filters.posture !== 'all') {
			const isFull = row.posture.fullHardening;
			if (filters.posture === 'full' ? !isFull : isFull) return false;
		}
		if (needle.length === 0) return true;
		return (
			row.project.name.toLowerCase().includes(needle) ||
			row.project.path.toLowerCase().includes(needle)
		);
	});
}
