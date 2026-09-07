import type { FilterRegister } from '../../../lib/filterFields.ts';
import type { ProfileMatrixRowModel } from './profileMatrixTypes.ts';

import { filterRegister } from '../../../lib/filterFields.ts';

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

export const profileMatrixUnsavedOptions = [
	{ label: 'All', value: 'all' },
	{ label: 'Unsaved only', value: 'dirty' },
];

export const profileMatrixPostureOptions = [
	{ label: 'All', value: 'all' },
	{ label: 'Standard', value: 'standard' },
	{ label: 'Low-exposure local', value: 'low' },
	{ label: 'Full hardening', value: 'full' },
];

export const profileMatrixSourceOptions = [
	{ label: 'All', value: 'all' },
	{ label: 'Explicit', value: 'explicit' },
	{ label: 'Inferred', value: 'inferred' },
];

function optionLabel(options: { label: string; value: string }[], value: string): string {
	return options.find((option) => option.value === value)?.label ?? value;
}

/**
 * The matrix's filtered-to-nothing register, built from the same options its toolbar renders.
 */
export function profileMatrixFilterRegister(
	filters: ProfileMatrixFilterState,
	onReset: () => void,
): FilterRegister | undefined {
	return filterRegister(onReset, [
		filters.query.trim() !== '' && { label: 'Search', value: filters.query.trim() },
		filters.dirtyOnly && { label: 'Unsaved', value: 'Unsaved only' },
		filters.posture !== 'all' && {
			label: 'Posture',
			value: optionLabel(profileMatrixPostureOptions, filters.posture),
		},
		filters.source !== 'all' && {
			label: 'Source',
			value: optionLabel(profileMatrixSourceOptions, filters.source),
		},
	]);
}

/**
 * Which of the three postures a row renders.
 *
 * `getProfilePosture` returns one of three labels — Full hardening, Low-exposure local, Standard —
 * so the filter reads both flags. Written against the `fullHardening` boolean alone, "Standard"
 * would mean "not full hardening" and sweep up every low-exposure project with it: a Low-exposure
 * local row could not be isolated by any setting of a control that claims to filter on that column.
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
