import type { FacetField, ProfileFacet } from '../detail/profile/profile-facets.ts';

import { postureFacetFields, profileFacets } from '../detail/profile/profile-facets.ts';

export const profileFacetColumnOptions = profileFacets.map((facet) => ({
	key: facet.field,
	label: facet.title,
})) satisfies readonly { key: FacetField; label: string }[];

export function defaultProfileFacetFields(): ReadonlySet<FacetField> {
	return new Set(postureFacetFields);
}

export function isDefaultProfileFacetSelection(selected: ReadonlySet<FacetField>): boolean {
	return (
		selected.size === postureFacetFields.length &&
		postureFacetFields.every((field) => selected.has(field))
	);
}

export function visibleProfileFacets(selected: ReadonlySet<FacetField>): readonly ProfileFacet[] {
	return profileFacets.filter((facet) => selected.has(facet.field));
}
