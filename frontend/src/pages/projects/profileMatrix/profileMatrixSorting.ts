import type { ProjectAssuranceProfileInput } from '../../../api/types.ts';
import type { FacetField } from '../detail/profile/profile-facets.ts';
import type {
	ProfileMatrixRowModel,
	ProfileMatrixSortDir,
	ProfileMatrixSortKey,
} from './profileMatrixTypes.ts';

import { profileFacets } from '../detail/profile/profile-facets.ts';

function compareText(left: string, right: string): number {
	return left.localeCompare(right, undefined, { sensitivity: 'base' });
}

function profileFacetLabel(
	field: FacetField,
	value: ProjectAssuranceProfileInput[FacetField],
): string {
	const facet = profileFacets.find((candidate) => candidate.field === field);
	const option = facet?.options.find((candidate) => candidate.value === value);
	return option?.label ?? value;
}

/**
 * The keys the table's headers sort on, in the order the headers declare them.
 *
 * The card stack below `xl` reads this list instead of growing a second sort model, so the two
 * layouts of the same 33 rows can be ordered the same way. The six facet keys are appended by the
 * caller when the page is in edit mode, matching the headers that appear with them.
 */
export const profileMatrixSortOptions: readonly { key: ProfileMatrixSortKey; label: string }[] = [
	{ key: 'project', label: 'Project' },
	{ key: 'posture', label: 'Posture' },
	{ key: 'audits', label: 'Audits' },
	{ key: 'source', label: 'Source' },
	{ key: 'updated', label: 'Updated' },
];

// Two of the keys are not text. Audits sorts on the required count, which is the number the column
// is asked about. `updatedAt` sorts on its epoch rather than its ISO string so a malformed or absent
// value cannot land in the middle of the run: `0` puts never-written profiles at the ascending end.
function sortValue(row: ProfileMatrixRowModel, key: ProfileMatrixSortKey): number | string {
	switch (key) {
		case 'audits':
			return row.preview?.audits.filter((audit) => audit.effect === 'required').length ?? 0;
		case 'posture':
			return row.posture.label;
		case 'project':
			return row.project.name;
		case 'source':
			return row.project.metadata.profile.source;
		case 'updated':
			return Date.parse(row.project.metadata.profile.updatedAt) || 0;
		default:
			return profileFacetLabel(key, row.form[key]);
	}
}

function compare(left: number | string, right: number | string): number {
	if (typeof left === 'number' && typeof right === 'number') return left - right;
	return compareText(String(left), String(right));
}

export function compareProfileMatrixRows(
	left: ProfileMatrixRowModel,
	right: ProfileMatrixRowModel,
	key: ProfileMatrixSortKey,
	dir: ProfileMatrixSortDir,
): number {
	const primary = compare(sortValue(left, key), sortValue(right, key));
	const result = primary === 0 ? compareText(left.project.name, right.project.name) : primary;
	return dir === 'asc' ? result : -result;
}
