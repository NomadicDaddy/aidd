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
	value: ProjectAssuranceProfileInput[FacetField]
): string {
	const facet = profileFacets.find((candidate) => candidate.field === field);
	const option = facet?.options.find((candidate) => candidate.value === value);
	return option?.label ?? value;
}

function sortValue(row: ProfileMatrixRowModel, key: ProfileMatrixSortKey): string {
	switch (key) {
		case 'posture':
			return row.posture.label;
		case 'project':
			return row.project.name;
		case 'source':
			return row.project.metadata.profile.source;
		default:
			return profileFacetLabel(key, row.form[key]);
	}
}

export function compareProfileMatrixRows(
	left: ProfileMatrixRowModel,
	right: ProfileMatrixRowModel,
	key: ProfileMatrixSortKey,
	dir: ProfileMatrixSortDir
): number {
	const primary = compareText(sortValue(left, key), sortValue(right, key));
	const result = primary === 0 ? compareText(left.project.name, right.project.name) : primary;
	return dir === 'asc' ? result : -result;
}
