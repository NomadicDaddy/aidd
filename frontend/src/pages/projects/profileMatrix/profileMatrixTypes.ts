import type { ProfilePreview } from '../../../api/projects.ts';
import type { ProjectAssuranceProfileInput, ProjectSummary } from '../../../api/types.ts';
import type { FacetField } from '../detail/profile/profile-facets.ts';
import type { ProfilePosture } from '../profile/profile-helpers.ts';

export type ProfileMatrixSortDir = 'asc' | 'desc';
// `audits` and `updated` join the list because they were the two columns without a sort glyph, and
// they carry the only numeric and the only temporal data on the page: which project needs the most
// required audits, and which profile changed most recently, were the two questions a 33-project
// fleet console could not answer while every other column sorted.
export type ProfileMatrixSortKey =
	'audits' | 'posture' | 'project' | 'source' | 'updated' | FacetField;

export interface ProfileMatrixRowModel {
	dirty: boolean;
	form: ProjectAssuranceProfileInput;
	posture: ProfilePosture;
	preview: ProfilePreview | undefined;
	project: ProjectSummary;
	saved: ProjectAssuranceProfileInput;
	saving: boolean;
}
