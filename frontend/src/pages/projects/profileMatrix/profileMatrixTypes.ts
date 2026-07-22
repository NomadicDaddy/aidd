import type { ProfilePreview } from '../../../api/projects.ts';
import type { ProjectAssuranceProfileInput, ProjectSummary } from '../../../api/types.ts';
import type { FacetField } from '../detail/profile/profile-facets.ts';
import type { ProfilePosture } from '../profile/profile-helpers.ts';

export type ProfileMatrixSortDir = 'asc' | 'desc';
export type ProfileMatrixSortKey = 'posture' | 'project' | 'source' | FacetField;

export interface ProfileMatrixRowModel {
	dirty: boolean;
	form: ProjectAssuranceProfileInput;
	posture: ProfilePosture;
	preview: ProfilePreview | undefined;
	project: ProjectSummary;
	saved: ProjectAssuranceProfileInput;
	saving: boolean;
}
