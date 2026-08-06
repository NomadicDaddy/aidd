import type { ProfileMatrixRowModel } from './profileMatrixTypes.ts';

export type PostureFilter = 'all' | 'full' | 'low' | 'standard';
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
 * Which of the three postures a row renders.
 *
 * `getProfilePosture` returns one of three labels — Full hardening, Low-exposure local, Standard —
 * and the filter used to be written against the `fullHardening` boolean alone, so "Standard" meant
 * "not full hardening" and swept up every low-exposure project with it. A Low-exposure local row
 * could not be isolated by any setting of the control that claimed to filter on that column.
 */
export function postureFilterValue(row: ProfileMatrixRowModel): Exclude<PostureFilter, 'all'> {
	if (row.posture.fullHardening) return 'full';
	return row.posture.lowExposure ? 'low' : 'standard';
}

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
		if (filters.posture !== 'all' && postureFilterValue(row) !== filters.posture) return false;
		if (needle.length === 0) return true;
		return (
			row.project.name.toLowerCase().includes(needle) ||
			row.project.path.toLowerCase().includes(needle)
		);
	});
}
